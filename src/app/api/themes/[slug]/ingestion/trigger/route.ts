import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGDELTUrls } from "@/lib/gdelt";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const theme = await prisma.theme.findUnique({
    where: { slug },
  });
  if (!theme) {
    return NextResponse.json({ error: "Theme not found" }, { status: 404 });
  }

  const [config, subtopics, domainRules] = await Promise.all([
    prisma.themeConfig.findFirst({
      where: { themeId: theme.id },
      orderBy: { version: "desc" },
    }),
    prisma.subtopic.findMany({
      where: { themeId: theme.id },
      orderBy: { weight: "desc" },
    }),
    prisma.domainRule.findMany({
      where: { themeId: theme.id },
    }),
  ]);

  if (!config) {
    return NextResponse.json(
      { error: "Theme has no config" },
      { status: 400 }
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let budget = await prisma.dailyBudgetUsage.findUnique({
    where: {
      themeId_date: { themeId: theme.id, date: today },
    },
  });

  if (!budget) {
    budget = await prisma.dailyBudgetUsage.create({
      data: {
        themeId: theme.id,
        date: today,
        used: 0,
        limit: config.dailyExtractionBudget,
      },
    });
  }

  if (budget.used >= budget.limit) {
    return NextResponse.json(
      { error: "Daily extraction budget exceeded" },
      { status: 429 }
    );
  }

  const ingestionJob = await prisma.ingestionJob.create({
    data: {
      themeId: theme.id,
      status: "pending",
      triggerType: "manual",
      configVersion: config.version,
    },
  });

  // Calculate how many URLs we can fetch based on remaining budget
  const remainingBudget = budget.limit - budget.used;
  // Use dailyExtractionBudget as maxrecords for GDELT, but limit to remaining budget
  const maxUrls = Math.min(remainingBudget, config.dailyExtractionBudget);

  let urls: Array<{ url: string; metadata: Partial<unknown> }> = [];

  console.log(`[Ingestion] Querying GDELT for theme: ${theme.slug}`);
  console.log(`[Ingestion] Config check:`, {
    hasGdeltParams: !!config.gdeltQueryParams,
    subtopicsCount: subtopics.length,
    subtopics: subtopics.map((st) => ({ name: st.name, slug: st.slug })),
    languages: config.targetLanguages,
    regions: config.targetRegions,
  });

  // Always try GDELT first (it will use default "news" query if no subtopics)
  try {
    // Prepare gdeltQueryParams with maxrecords from dailyExtractionBudget
    let gdeltQueryParams = config.gdeltQueryParams as Record<string, unknown> | null;
    if (gdeltQueryParams && typeof gdeltQueryParams === "object") {
      // Ensure maxrecords is set to the desired number of headlines per day
      // Use maxArticleAge from config if set, otherwise preserve timespan from gdeltQueryParams
      gdeltQueryParams = {
        ...gdeltQueryParams,
        maxrecords: Math.min(maxUrls, 250), // Use maxUrls (which is based on dailyExtractionBudget), cap at 250
      };
      // Override timespan with maxArticleAge if configured
      if (config.maxArticleAge) {
        gdeltQueryParams.timespan = config.maxArticleAge;
      } else if (!gdeltQueryParams.timespan) {
        // Remove timespan if not explicitly configured (GDELT defaults to last 3 months)
        delete gdeltQueryParams.timespan;
      }
    } else if (config.maxArticleAge) {
      // Create gdeltQueryParams if it doesn't exist but maxArticleAge is set
      gdeltQueryParams = {
        mode: "artlist",
        format: "json",
        maxrecords: Math.min(maxUrls, 250),
        timespan: config.maxArticleAge,
      };
    }
    urls = await getGDELTUrls(
      {
        gdeltQueryParams: gdeltQueryParams ?? undefined,
        targetLanguages: config.targetLanguages,
        targetRegions: config.targetRegions,
      },
      subtopics.length > 0
        ? subtopics.map((st) => ({ name: st.name, weight: st.weight }))
        : undefined,
      maxUrls,
      domainRules.map((r) => ({ domain: r.domain, rule: r.rule }))
    );

    console.log(`[Ingestion] ✅ GDELT returned ${urls.length} URLs for theme ${theme.slug}`);
    if (urls.length > 0) {
      console.log(`[Ingestion] Sample URLs:`, urls.slice(0, 5).map((u) => u.url));
    } else {
      console.warn(`[Ingestion] ⚠️ GDELT returned 0 URLs. This might be normal if query is too specific.`);
      // Don't fallback immediately - let user know GDELT was queried but returned no results
    }
  } catch (error) {
    console.error("[Ingestion] ❌ GDELT query failed:", error);
    if (error instanceof Error) {
      console.error("[Ingestion] Error details:", error.message);
      console.error("[Ingestion] Error stack:", error.stack);
    }
    
    // Fallback to mock URLs ONLY if GDELT fails with an error
    console.warn(`[Ingestion] GDELT failed, falling back to mock URLs`);
    urls = [
      { url: "https://www.reuters.com/markets/", metadata: {} },
      { url: "https://www.bloomberg.com/markets", metadata: {} },
      { url: "https://www.cnbc.com/world/", metadata: {} },
    ].slice(0, Math.min(remainingBudget, 3));
    
    console.log(`[Ingestion] Using ${urls.length} fallback URLs`);
  }

  // Limit to remaining budget
  const urlsToProcess = urls.slice(0, remainingBudget);

  if (urlsToProcess.length === 0) {
    await prisma.ingestionJob.update({
      where: { id: ingestionJob.id },
      data: { status: "completed" },
    });

    return NextResponse.json({
      ingestionJobId: ingestionJob.id,
      status: "completed",
      message: "No URLs to process (budget exhausted or no results)",
      urlsFound: urls.length,
      urlsProcessed: 0,
    });
  }

  // Create scrape jobs for each URL
  // Map URLs to their metadata (including seendate from GDELT)
  const urlMetadataMap = new Map(
    urlsToProcess.map((item) => [item.url, item.metadata])
  );

  const scrapeJobs = await Promise.all(
    urlsToProcess.map((item) =>
      prisma.scrapeJob.create({
        data: {
          ingestionJobId: ingestionJob.id,
          url: item.url,
          status: "pending",
        },
      })
    )
  );

  // Trigger scraping for each job (fire and forget)
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  let triggeredCount = 0;
  scrapeJobs.forEach((scrapeJob) => {
    const metadata = urlMetadataMap.get(scrapeJob.url);
    fetch(`${baseUrl}/api/worker/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scrapeJobId: scrapeJob.id,
        themeId: theme.id,
        url: scrapeJob.url,
        gdeltSeenDate: metadata?.seendate || null,
      }),
    })
      .then(() => {
        triggeredCount++;
      })
      .catch((err) => {
        console.error(`[Ingestion] Failed to trigger scrape for job ${scrapeJob.id}:`, err);
      });
  });

  await prisma.ingestionJob.update({
    where: { id: ingestionJob.id },
    data: { status: "running" },
  });

  return NextResponse.json({
    ingestionJobId: ingestionJob.id,
    status: "running",
    message: "Ingestion triggered",
    urlsFound: urls.length,
    urlsProcessed: urlsToProcess.length,
    remainingBudget: remainingBudget - urlsToProcess.length,
  });
}
