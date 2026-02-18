import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractArticle } from "@/lib/extraction";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { scrapeJobId, themeId, url, gdeltSeenDate } = body;
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

    await prisma.scrapeJob.update({
      where: { id: scrapeJobId },
      data: { status: "scraping" },
    });

    const result = await extractArticle(url);
    
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
    console.error(e);
    return NextResponse.json(
      { error: "Scrape failed" },
      { status: 500 }
    );
  }
}
