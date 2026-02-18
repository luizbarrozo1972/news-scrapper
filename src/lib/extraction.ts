const MIN_TEXT_LENGTH = 200;

export type ExtractionResult = {
  cleanText: string;
  headline: string | null;
  publishedAt: Date | null;
  method: "trafilatura" | "readability" | "playwright";
  durationMs: number;
};

/**
 * Extract publication date from HTML using common meta tags and time elements
 */
function extractPublishedDate(html: string, dom: any): Date | null {
  try {
    const doc = dom.window.document;
    
    // Try common meta tags
    const metaTags = [
      'meta[property="article:published_time"]',
      'meta[name="article:published_time"]',
      'meta[property="og:published_time"]',
      'meta[name="publish-date"]',
      'meta[name="pubdate"]',
      'meta[name="publication-date"]',
      'meta[name="date"]',
      'time[datetime]',
      'time[pubdate]',
    ];

    for (const selector of metaTags) {
      const element = doc.querySelector(selector);
      if (element) {
        const dateStr = element.getAttribute('content') || 
                       element.getAttribute('datetime') || 
                       element.getAttribute('pubdate');
        if (dateStr) {
          const date = new Date(dateStr);
          if (!isNaN(date.getTime()) && date.getTime() > 0) {
            return date;
          }
        }
      }
    }

    // Try JSON-LD structured data
    const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.textContent || '{}');
        if (data.datePublished) {
          const date = new Date(data.datePublished);
          if (!isNaN(date.getTime()) && date.getTime() > 0) {
            return date;
          }
        }
        if (data['@type'] === 'NewsArticle' && data.datePublished) {
          const date = new Date(data.datePublished);
          if (!isNaN(date.getTime()) && date.getTime() > 0) {
            return date;
          }
        }
      } catch {
        // Skip invalid JSON
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function extractWithReadability(
  html: string,
  url: string
): Promise<ExtractionResult | null> {
  const start = Date.now();
  try {
    const { JSDOM } = await import("jsdom");
    const { Readability } = await import("@mozilla/readability");
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    const durationMs = Date.now() - start;

    if (!article?.textContent || article.textContent.length < MIN_TEXT_LENGTH) {
      return null;
    }

    const publishedAt = extractPublishedDate(html, dom);

    return {
      cleanText: article.textContent.trim(),
      headline: article.title ?? null,
      publishedAt,
      method: "readability",
      durationMs,
    };
  } catch {
    return null;
  }
}

export async function extractArticle(url: string): Promise<ExtractionResult | null> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; NewsScraper/1.0; +https://example.com/bot)",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const html = await res.text();

  const result = await extractWithReadability(html, url);
  if (result && result.cleanText.length >= MIN_TEXT_LENGTH) {
    return { ...result, method: "readability" as const };
  }

  return null;
}
