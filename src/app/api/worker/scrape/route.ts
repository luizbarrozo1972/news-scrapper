import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractArticle } from "@/lib/extraction";
import crypto from "crypto";

/**
 * Check if all scrape jobs for an ingestion job are complete and update ingestion job status.
 */
async function checkAndUpdateIngestionJobStatus(ingestionJobId: string): Promise<void> {
  const ingestionJob = await prisma.ingestionJob.findUnique({
    where: { id: ingestionJobId },
    include: {
      scrapeJobs: {
        select: { status: true },
      },
    },
  });

  if (!ingestionJob) {
    return;
  }

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/6e8eb9c3-853c-4fd1-bcc7-b6f3071ae589',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape/route.ts:checkAndUpdateIngestionJobStatus',message:'Checking ingestion job completion',data:{ingestionJobId,currentStatus:ingestionJob.status,totalScrapeJobs:ingestionJob.scrapeJobs.length,jobStatuses:ingestionJob.scrapeJobs.map(j=>j.status)},timestamp:Date.now(),hypothesisId:'H12'})}).catch(()=>{});
  // #endregion

  if (ingestionJob.status !== "running") {
    return;
  }

  // Edge case: if no scrape jobs exist, mark as completed immediately
  if (ingestionJob.scrapeJobs.length === 0) {
    await prisma.ingestionJob.update({
      where: { id: ingestionJobId },
      data: { status: "completed", completedAt: new Date() },
    });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/6e8eb9c3-853c-4fd1-bcc7-b6f3071ae589',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape/route.ts:checkAndUpdateIngestionJobStatus',message:'No scrape jobs - marking completed',data:{ingestionJobId},timestamp:Date.now(),hypothesisId:'H12'})}).catch(()=>{});
    // #endregion
    return;
  }

  const allJobsDone = ingestionJob.scrapeJobs.every(
    (job) => job.status === "extracted" || job.status === "failed" || job.status === "skipped"
  );

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/6e8eb9c3-853c-4fd1-bcc7-b6f3071ae589',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape/route.ts:checkAndUpdateIngestionJobStatus',message:'All jobs done check',data:{ingestionJobId,allJobsDone,jobStatuses:ingestionJob.scrapeJobs.map(j=>j.status)},timestamp:Date.now(),hypothesisId:'H12'})}).catch(()=>{});
  // #endregion

  if (allJobsDone) {
    const updateTimestamp = Date.now();
    await prisma.ingestionJob.update({
      where: { id: ingestionJobId },
      data: { status: "completed", completedAt: new Date() },
    });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/6e8eb9c3-853c-4fd1-bcc7-b6f3071ae589',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape/route.ts:checkAndUpdateIngestionJobStatus',message:'Marked ingestion job as completed',data:{ingestionJobId,updateTimestamp,note:'DB update completed at this timestamp'},timestamp:Date.now(),hypothesisId:'H14,H16'})}).catch(()=>{});
    // #endregion
  }
}

export async function POST(request: Request) {
  let scrapeJobId: string | undefined;
  let ingestionJobId: string | undefined;
  try {
    const body = await request.json();
    scrapeJobId = body.scrapeJobId;
    const { themeId, url, gdeltSeenDate } = body;
    if (!scrapeJobId || !themeId || !url) {
      return NextResponse.json(
        { error: "Missing scrapeJobId, themeId, or url" },
        { status: 400 }
      );
    }

    const scrapeJob = await prisma.scrapeJob.findFirst({
      where: { id: scrapeJobId, ingestionJob: { themeId } },
    });
    if (!scrapeJob) {
      return NextResponse.json({ error: "Scrape job not found" }, { status: 404 });
    }
    ingestionJobId = scrapeJob.ingestionJobId;

    await prisma.scrapeJob.update({
      where: { id: scrapeJobId },
      data: { status: "scraping" },
    });

    // Add timeout to prevent hanging (30 seconds)
    const extractTimeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Extraction timeout after 30 seconds")), 30000);
    });
    
    let result: Awaited<ReturnType<typeof extractArticle>> | null = null;
    try {
      result = await Promise.race([
        extractArticle(url),
        extractTimeout,
      ]);
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/6e8eb9c3-853c-4fd1-bcc7-b6f3071ae589',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape/route.ts:POST',message:'Extraction error/timeout',data:{scrapeJobId,url,error:error instanceof Error ? error.message : String(error)},timestamp:Date.now(),hypothesisId:'H22'})}).catch(()=>{});
      // #endregion
      // Re-throw to be caught by outer catch block
      throw error;
    }
    
    // Use extracted publishedAt if available, otherwise fallback to GDELT seendate
    let publishedAt: Date | null = result?.publishedAt || null;
    if (!publishedAt && gdeltSeenDate) {
      try {
        // GDELT seendate format: "20260217" (YYYYMMDD) or ISO string
        const parsed = gdeltSeenDate.length === 8 
          ? new Date(`${gdeltSeenDate.substring(0,4)}-${gdeltSeenDate.substring(4,6)}-${gdeltSeenDate.substring(6,8)}`)
          : new Date(gdeltSeenDate);
        if (!isNaN(parsed.getTime()) && parsed.getTime() > 0) {
          publishedAt = parsed;
        }
      } catch {
        // Invalid date, keep null
      }
    }
    
    if (!result) {
      await prisma.extractionAttempt.create({
        data: {
          scrapeJobId,
          method: "readability",
          status: "failed",
          errorMsg: "Extraction failed",
        },
      });
      await prisma.scrapeJob.update({
        where: { id: scrapeJobId },
        data: { status: "failed" },
      });

      await checkAndUpdateIngestionJobStatus(ingestionJobId);

      return NextResponse.json({ status: "failed" });
    }

    await prisma.extractionAttempt.create({
      data: {
        scrapeJobId,
        method: result.method,
        status: "success",
        durationMs: result.durationMs,
        cleanTextLength: result.cleanText.length,
      },
    });

    const dedupHash = crypto
      .createHash("sha256")
      .update(result.cleanText.replace(/\s+/g, " ").trim())
      .digest("hex");

    const existing = await prisma.extractedDocument.findFirst({
      where: { themeId, dedupHash },
    });
    if (existing) {
      await prisma.scrapeJob.update({
        where: { id: scrapeJobId },
        data: { status: "skipped" },
      });

      await checkAndUpdateIngestionJobStatus(ingestionJobId);

      return NextResponse.json({ status: "skipped", reason: "duplicate" });
    }

    let canonicalUrl = url;
    try {
      const u = new URL(url);
      canonicalUrl = `${u.origin}${u.pathname}`.replace(/\/$/, "") || url;
    } catch {
      canonicalUrl = url;
    }

    const sourceDomain = (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    })();

    const summaryEditorial =
      result.cleanText.length > 200
        ? result.cleanText.slice(0, 300).trim() + "..."
        : result.cleanText;

    const extractedDoc = await prisma.extractedDocument.create({
      data: {
        scrapeJobId,
        themeId,
        cleanText: result.cleanText,
        headline: result.headline,
        canonicalUrl,
        sourceDomain,
        publishedAt,
        scrapedAt: new Date(),
        extractionMethod: result.method,
        textLength: result.cleanText.length,
        qualityScore: 0.8,
        dedupHash,
      },
    });

    const newsItemPayload = {
      url,
      canonical_url: canonicalUrl,
      source_domain: sourceDomain,
      published_at: publishedAt ? publishedAt.toISOString() : null,
      scraped_at: new Date().toISOString(),
      language: "en",
      headline: result.headline,
      clean_text: result.cleanText,
      summary: {
        editorial: summaryEditorial,
        extraction: {
          method: result.method,
          duration_ms: result.durationMs,
          text_length: result.cleanText.length,
          flags: [],
        },
      },
      entities: [],
      topics: [],
      claims: [],
      extraction_method: result.method,
      quality_score: 0.8,
      dedup_hash: dedupHash,
    };

    await prisma.newsItem.create({
      data: {
        extractedDocId: extractedDoc.id,
        themeId,
        payload: newsItemPayload as object,
        summaryEditorial,
        summaryExtraction: {
          method: result.method,
          durationMs: result.durationMs,
          textLength: result.cleanText.length,
          flags: [],
        } as object,
        deliveryStatus: "pending",
      },
    });

    await prisma.scrapeJob.update({
      where: { id: scrapeJobId },
      data: { status: "extracted", completedAt: new Date() },
    });

    await checkAndUpdateIngestionJobStatus(ingestionJobId);

    const config = await prisma.themeConfig.findFirst({
      where: { themeId },
      orderBy: { version: "desc" },
    });
    const limit = config?.dailyExtractionBudget ?? 500;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await prisma.dailyBudgetUsage.upsert({
      where: {
        themeId_date: { themeId, date: today },
      },
      create: {
        themeId,
        date: today,
        used: 1,
        limit,
      },
      update: { used: { increment: 1 } },
    });

    return NextResponse.json({ status: "extracted" });
  } catch (e) {
    console.error("[Scrape] Error:", e);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/6e8eb9c3-853c-4fd1-bcc7-b6f3071ae589',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape/route.ts:POST:catch',message:'Scrape job error handler',data:{error:String(e),errorName:e instanceof Error ? e.name : 'Unknown',scrapeJobId,ingestionJobId},timestamp:Date.now(),hypothesisId:'H22'})}).catch(()=>{});
    // #endregion
    
    // Mark scrape job as failed if we have the ID
    if (scrapeJobId) {
      try {
        await prisma.scrapeJob.update({
          where: { id: scrapeJobId },
          data: { status: "failed" },
        });
        // Check if ingestion job should be marked as completed
        if (ingestionJobId) {
          await checkAndUpdateIngestionJobStatus(ingestionJobId);
        }
      } catch (updateError) {
        console.error("[Scrape] Failed to update job status:", updateError);
      }
    }
    
    return NextResponse.json(
      { error: "Scrape failed" },
      { status: 500 }
    );
  }
}
