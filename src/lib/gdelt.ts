/**
 * GDELT DOC 2.0 API Integration
 * 
 * Documentation: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts
 * API Endpoint: https://api.gdeltproject.org/api/v2/doc/doc
 * 
 * IMPORTANT: GDELT DOC 2.0 API is FREE and PUBLIC - NO API KEY REQUIRED!
 * This API searches the last 3 months of global news coverage across 65 languages.
 * Rate limits may apply, but no authentication is needed.
 */

import { GDELT_LANGUAGES, GDELT_COUNTRIES } from "./gdelt-constants";

/**
 * Translate subtopic names to English for GDELT queries.
 * GDELT requires English keywords even when filtering by sourcelang:portuguese.
 * Uses Gemini API if available, otherwise falls back to a comprehensive mapping.
 */
async function translateToEnglish(subtopicName: string): Promise<string> {
  const name = subtopicName.trim();
  const lower = name.toLowerCase();
  
  // Check if it's already clearly English (common English financial terms)
  const englishTerms = new Set([
    "stocks", "stock", "market", "earnings", "dividends", "inflation", "gdp", "ipo", "etf", "etfs",
    "exchange", "rate", "interest", "bonds", "treasury", "federal", "reserve", "economy", "economic",
    "recession", "growth", "unemployment", "trade", "exports", "imports", "currency", "dollar",
    "crypto", "bitcoin", "commodities", "oil", "gold", "silver", "corporate", "company", "companies"
  ]);
  const words = lower.split(/\s+/);
  if (words.every(w => englishTerms.has(w) || /^[a-z]{1,4}$/.test(w) || /^[A-Z]{2,4}$/.test(w))) {
    return name; // Likely already English
  }

  // Comprehensive fallback mapping (checked first for speed)
  const fallbackMap: Record<string, string> = {
    "cri": "CRI",
    "debentures incentivadas": "incentivized debentures",
    "debentures": "debentures",
    "maiores baixas da bolsa": "biggest stock market declines",
    "maiores altas da bolsa": "biggest stock market gains",
    "inflação": "inflation",
    "inflacao": "inflation",
    "resultados das companhias abertas": "public company earnings",
    "resultados": "earnings",
    "macroeconomia": "macroeconomics",
    "ações na b3 hojê": "stocks on B3 today",
    "ações na b3 hoje": "stocks on B3 today",
    "ações": "stocks",
    "câmbio": "exchange rate",
    "cambio": "exchange rate",
    "ipos": "IPOs",
    "renda fixa": "fixed income",
    "eventos corporativos": "corporate events",
    "etfs": "ETFs",
    "dividendos": "dividends",
    "cra": "CRA",
    "lci": "LCI",
    "lca": "LCA",
    "juros": "interest rates",
    "selic": "Selic",
    "bovespa": "Bovespa",
    "ibovespa": "Ibovespa",
    "b3": "B3",
  };
  
  if (fallbackMap[lower]) {
    return fallbackMap[lower];
  }

  // Try Gemini API translation if available
  const VERTEX_API = process.env.GOOGLE_VERTEX_API_KEY || process.env.GEMINI_API_KEY;
  if (VERTEX_API) {
    try {
      const prompt = `Translate this Portuguese financial/news term to English. Return ONLY the English translation, nothing else. If it's a proper noun (like "B3", "Selic", "Bovespa", "CRI", "CRA", "LCI", "LCA"), keep it as-is. If it's already in English, return it unchanged.\n\nTerm: "${name}"`;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${VERTEX_API}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 50 },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const translated = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (translated && translated.length > 0 && translated.length < 200) {
          const cleaned = translated.replace(/^["']|["']$/g, '').trim();
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/6e8eb9c3-853c-4fd1-bcc7-b6f3071ae589',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gdelt.ts:translateToEnglish:gemini',message:'Gemini translation',data:{original:name,translated:cleaned},timestamp:Date.now(),hypothesisId:'H8'})}).catch(()=>{});
          // #endregion
          return cleaned;
        }
      }
    } catch (e) {
      console.warn(`[GDELT] Translation API failed for "${name}":`, e);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/6e8eb9c3-853c-4fd1-bcc7-b6f3071ae589',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gdelt.ts:translateToEnglish:error',message:'Translation API error',data:{original:name,error:String(e)},timestamp:Date.now(),hypothesisId:'H8'})}).catch(()=>{});
      // #endregion
    }
  }
  
  // Final fallback: return original (will be sent as-is, may not work with GDELT)
  console.warn(`[GDELT] No translation found for "${name}", using original`);
  return name;
}

export interface GDELTQueryParams {
  keywords?: string;
  timespan?: string; // e.g., "24h", "7d", "30d", or custom date range
  mode?: "artlist" | "timelinevol" | "timelinevolraw" | "timelinetone" | "tonechart";
  format?: "json" | "jsonp";
  maxrecords?: number; // max articles to return
  domain?: string; // filter by domain
  sourcelang?: string; // source language filter
  country?: string; // country filter
  near?: string; // NEAR operator (e.g., "near20:clinton email")
  repeat?: string; // REPEAT operator (e.g., "repeat3:melania")
}

export interface GDELTArticle {
  url: string;
  url_mobile?: string;
  title: string;
  seendate: string;
  socialimage?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
}

export interface GDELTResponse {
  articles?: GDELTArticle[];
  timeline?: unknown[];
  tonechart?: unknown[];
  [key: string]: unknown;
}

/**
 * Normalize language name to ISO 639-1 code
 */
function normalizeLanguage(lang: string | null | undefined): string | null {
  if (!lang) return null;
  const langLower = lang.toLowerCase();
  
  // Common mappings
  const langMap: Record<string, string> = {
    "english": "en",
    "portuguese": "pt",
    "spanish": "es",
    "french": "fr",
    "german": "de",
    "italian": "it",
    "chinese": "zh",
    "japanese": "ja",
    "korean": "ko",
    "russian": "ru",
    "arabic": "ar",
    "hindi": "hi",
  };
  
  // If already a code (2-3 chars), return as-is
  if (langLower.length <= 3 && /^[a-z]+$/.test(langLower)) {
    return langLower;
  }
  
  // Try to find in map
  return langMap[langLower] || langLower;
}

/**
 * Normalize country name to ISO 3166-1 alpha-2 code
 */
function normalizeCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  const countryLower = country.toLowerCase();
  
  // Common mappings
  const countryMap: Record<string, string> = {
    "brazil": "BR",
    "brasil": "BR",
    "united states": "US",
    "usa": "US",
    "united kingdom": "GB",
    "uk": "GB",
    "india": "IN",
    "china": "CN",
    "japan": "JP",
    "germany": "DE",
    "france": "FR",
    "italy": "IT",
    "spain": "ES",
    "portugal": "PT",
    "argentina": "AR",
    "mexico": "MX",
    "canada": "CA",
    "australia": "AU",
    "nigeria": "NG",
    "south africa": "ZA",
    "russia": "RU",
  };
  
  // If already a code (2 chars uppercase), return as-is
  if (country.length === 2 && /^[A-Z]{2}$/.test(country)) {
    return country;
  }
  
  // Try to find in map
  return countryMap[countryLower] || country.toUpperCase();
}

/**
 * Build GDELT query parameters from ThemeConfig.
 * Translates subtopic names to English (GDELT requires English keywords).
 */
export async function buildGDELTQueryParams(
  config: {
    gdeltQueryParams?: Record<string, unknown> | null;
    targetLanguages?: string[];
    targetRegions?: string[];
  },
  subtopics?: Array<{ name: string; weight: number }>
): Promise<GDELTQueryParams> {
  const params: GDELTQueryParams = {
    mode: "artlist",
    format: "json",
    maxrecords: 100, // Default limit, will be filtered by budget
  };

  // Apply non-keyword overrides from gdeltQueryParams (timespan, maxrecords, etc.)
  if (config.gdeltQueryParams) {
    const { query, keywords: _kw, ...rest } = config.gdeltQueryParams as Record<string, unknown>;
    Object.assign(params, rest);
  }

  // Build keywords from subtopics if available
  // IMPORTANT: GDELT requires English keywords even when filtering by sourcelang:portuguese
  let keywords = "";
  if (subtopics && subtopics.length > 0) {
    // Translate all subtopic names to English
    const translatedNames = await Promise.all(
      subtopics.map((st) => translateToEnglish(st.name))
    );
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/6e8eb9c3-853c-4fd1-bcc7-b6f3071ae589',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gdelt.ts:buildGDELTQueryParams:translation',message:'Translated subtopics to English',data:{original:subtopics.map(s=>s.name),translated:translatedNames},timestamp:Date.now(),hypothesisId:'H8'})}).catch(()=>{});
    // #endregion
    
    // Build query with OR operators and quotes for phrases
    keywords = translatedNames
      .map((name) => {
        const lower = name.toLowerCase().trim();
        // If it's a phrase (has spaces) or has special characters, wrap in quotes
        if (lower.includes(" ") || /[àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ\-]/.test(lower)) {
          return `"${lower}"`;
        }
        return lower;
      })
      .join(" OR ");
    console.log(`[GDELT] Built keywords from ${subtopics.length} subtopics (translated to English): ${keywords}`);
  } else if (params.keywords) {
    keywords = String(params.keywords);
  } else {
    // Default query if no subtopics and no custom query
    keywords = "news";
    console.log(`[GDELT] No subtopics found, using default query: "news"`);
  }

  // GDELT syntax: parentheses ONLY around OR groups; space = implicit AND.
  // Correct:  (kw1 OR kw2) sourcelang:portuguese sourcecountry:BR
  // Wrong:    (kw1 OR kw2) AND (sourcelang:portuguese) AND (sourcecountry:BR)
  const isoToGdelt: Record<string, string> = {
    pt:"por",es:"spa",en:"eng",fr:"fra",de:"deu",it:"ita",
    ru:"rus",ja:"jpn",zh:"zho",ko:"kor",ar:"ara",hi:"hin",
  };

  // Wrap keywords in parens (they are OR'd)
  if (keywords) {
    keywords = `(${keywords})`;
  }

  // Append sourcelang: filters (space-separated = AND)
  if (config.targetLanguages && config.targetLanguages.length > 0) {
    const langParts = config.targetLanguages.map((langCode) => {
      let code = langCode.toLowerCase();
      if (code.length === 2 && isoToGdelt[code]) code = isoToGdelt[code];
      const lang = GDELT_LANGUAGES.find((l) => l.code.toLowerCase() === code);
      return `sourcelang:${lang ? lang.name.toLowerCase() : code}`;
    });
    const langExpr = langParts.length === 1 ? langParts[0] : `(${langParts.join(" OR ")})`;
    keywords = keywords ? `${keywords} ${langExpr}` : langExpr;
    console.log(`[GDELT] Added language filters: ${langExpr}`);
  }

  // Append sourcecountry: filters (space-separated = AND)
  if (config.targetRegions && config.targetRegions.length > 0) {
    const countryParts = config.targetRegions.map((r) => `sourcecountry:${r.toUpperCase()}`);
    const countryExpr = countryParts.length === 1 ? countryParts[0] : `(${countryParts.join(" OR ")})`;
    keywords = keywords ? `${keywords} ${countryExpr}` : countryExpr;
    console.log(`[GDELT] Added country filters: ${countryExpr}`);
  }

  params.keywords = keywords;

  // Note: timespan is optional - if not specified, GDELT searches last 3 months
  // Only set if explicitly provided in gdeltQueryParams

  console.log(`[GDELT] Built query params:`, params);

  return params;
}

/**
 * Query GDELT API and return articles
 */
export async function queryGDELT(
  queryParams: GDELTQueryParams
): Promise<GDELTArticle[]> {
  const baseUrl = "https://api.gdeltproject.org/api/v2/doc/doc";
  const url = new URL(baseUrl);

  // GDELT uses 'query' parameter (lowercase) - this is REQUIRED
  // Support both 'keywords' (our interface) and 'query' (direct from config)
  const queryValue = queryParams.keywords || (queryParams as any).query;
  if (queryValue) {
    url.searchParams.append("query", String(queryValue));
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/6e8eb9c3-853c-4fd1-bcc7-b6f3071ae589',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gdelt.ts:queryGDELT:query',message:'Query sent to GDELT',data:{query:String(queryValue).substring(0,400)},timestamp:Date.now(),hypothesisId:'H6-fix'})}).catch(()=>{});
    // #endregion
  } else {
    // If no keywords provided, use default
    url.searchParams.append("query", "news");
    console.warn(`[GDELT] No keywords/query provided, using default query: "news"`);
  }

  // Add other query parameters (GDELT expects lowercase for most params)
  if (queryParams.mode) {
    url.searchParams.append("mode", queryParams.mode);
  } else {
    url.searchParams.append("mode", "artlist");
  }

  if (queryParams.format) {
    url.searchParams.append("format", queryParams.format);
  } else {
    url.searchParams.append("format", "json");
  }

  if (queryParams.maxrecords) {
    url.searchParams.append("maxrecords", String(queryParams.maxrecords));
  }

  // TIMESPAN parameter (if provided)
  // Apply timespan when explicitly configured by user (via maxArticleAge)
  // GDELT searches last 3 months by default if timespan is not specified
  if (queryParams.timespan) {
    url.searchParams.append("timespan", queryParams.timespan);
    console.log(`[GDELT] Applying timespan filter: ${queryParams.timespan}`);
  }

    const finalUrl = url.toString();
  console.log(`[GDELT] Querying: ${finalUrl}`);
  
  // Validate that we have a query parameter
  if (!url.searchParams.has("query")) {
    console.error(`[GDELT] ⚠️ No query parameter found in URL!`);
    throw new Error("GDELT query parameter is required");
  }

  try {
    // Retry logic: try up to 3 times with exponential backoff
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (attempt > 1) {
          const delay = Math.pow(2, attempt - 2) * 1000; // 1s, 2s, 4s
          console.log(`[GDELT] Retry attempt ${attempt} after ${delay}ms delay`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        const response = await fetch(url.toString(), {
          headers: {
            "User-Agent": "NewsScraperPlatform/1.0",
            "Accept": "application/json",
          },
          signal: AbortSignal.timeout(30000), // 30 second timeout
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[GDELT] API error ${response.status}:`, errorText);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/6e8eb9c3-853c-4fd1-bcc7-b6f3071ae589',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gdelt.ts:queryGDELT:httpError',message:'GDELT HTTP error',data:{status:response.status,error:errorText.substring(0,500),url:url.toString().substring(0,500)},timestamp:Date.now(),hypothesisId:'H6'})}).catch(()=>{});
          // #endregion
          throw new Error(`GDELT API error: ${response.status} ${errorText}`);
        }

        const contentType = response.headers.get("content-type");
        if (!contentType?.includes("application/json")) {
          const text = await response.text();
          console.error(`[GDELT] Unexpected content type: ${contentType}`);
          console.error(`[GDELT] Response preview: ${text.substring(0, 500)}`);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/6e8eb9c3-853c-4fd1-bcc7-b6f3071ae589',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gdelt.ts:queryGDELT:nonJson',message:'GDELT non-JSON response',data:{contentType,preview:text.substring(0,300),url:url.toString().substring(0,500)},timestamp:Date.now(),hypothesisId:'H6'})}).catch(()=>{});
          // #endregion
          throw new Error(`GDELT returned non-JSON response: ${contentType}`);
        }

        const data = (await response.json()) as GDELTResponse;

        console.log(`[GDELT] Response keys:`, Object.keys(data));
        console.log(`[GDELT] Response sample:`, JSON.stringify(data).substring(0, 500));

        // Extract articles from response - GDELT may return articles directly or in a nested structure
        let articles: GDELTArticle[] = [];
        
        if (Array.isArray(data)) {
          articles = data as GDELTArticle[];
        } else if (data.articles && Array.isArray(data.articles)) {
          articles = data.articles;
        } else if (data.results && Array.isArray(data.results)) {
          articles = data.results as GDELTArticle[];
        } else {
          // Try to find any array in the response
          const entries = Object.entries(data);
          for (const [key, value] of entries) {
            if (Array.isArray(value) && value.length > 0) {
              console.log(`[GDELT] Found array in key: ${key}`);
              articles = value as GDELTArticle[];
              break;
            }
          }
        }

        console.log(`[GDELT] Found ${articles.length} articles`);

        return articles;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`[GDELT] Attempt ${attempt} failed:`, lastError.message);
        if (attempt === 3) {
          // Last attempt failed, throw the error
          throw lastError;
        }
        // Otherwise, continue to next retry
      }
    }
    
    // This should never be reached, but TypeScript needs it
    throw lastError || new Error("GDELT query failed after retries");
  } catch (error) {
    console.error("[GDELT] Query failed after all retries:", error);
    if (error instanceof Error) {
      console.error("[GDELT] Error message:", error.message);
      console.error("[GDELT] Error stack:", error.stack);
    }
    throw error;
  }
}

/**
 * Filter articles by domain rules (allow/block).
 * When allowedDomains is non-empty, only articles from those domains are kept.
 * When blockedDomains is non-empty, articles from those domains are excluded.
 * When no domain rules exist, all domains are allowed.
 */
function applyDomainFilter(
  articles: GDELTArticle[],
  domainRules: Array<{ domain: string; rule: string }>
): GDELTArticle[] {
  if (domainRules.length === 0) return articles;

  const allowedDomains = domainRules.filter((r) => r.rule === "allow").map((r) => r.domain.toLowerCase());
  const blockedDomains = domainRules.filter((r) => r.rule === "block").map((r) => r.domain.toLowerCase());

  return articles.filter((a) => {
    if (!a.domain) return allowedDomains.length === 0;
    const articleDomain = a.domain.toLowerCase();
    if (blockedDomains.some((d) => articleDomain === d || articleDomain.endsWith(`.${d}`))) return false;
    if (allowedDomains.length > 0) {
      return allowedDomains.some((d) => articleDomain === d || articleDomain.endsWith(`.${d}`));
    }
    return true;
  });
}

/**
 * Post-filter articles by language/country using GDELT article metadata.
 */
function applyLocaleFilter(
  articles: GDELTArticle[],
  targetLanguages: string[],
  targetRegions: string[]
): GDELTArticle[] {
  if (!targetLanguages.length && !targetRegions.length) return articles;

  const isoToGdelt: Record<string, string> = { en:"eng",pt:"por",es:"spa",fr:"fra",de:"deu",it:"ita",ru:"rus",ja:"jpn",zh:"zho",ko:"kor",ar:"ara",hi:"hin" };
  const langNames = targetLanguages.map((l) => {
    const c = (l.length === 2 && isoToGdelt[l.toLowerCase()]) ? isoToGdelt[l.toLowerCase()] : l.toLowerCase();
    const found = GDELT_LANGUAGES.find((lg) => lg.code.toLowerCase() === c);
    return found ? found.name.toLowerCase() : c;
  });
  const countryCodes = targetRegions.map((r) => r.toUpperCase());
  const countryNameToCode = Object.fromEntries(GDELT_COUNTRIES.map((c) => [c.name.toUpperCase(), c.code]));

  return articles.filter((a) => {
    if (langNames.length && a.language) {
      if (!langNames.some((l) => a.language!.toLowerCase().includes(l))) return false;
    }
    if (countryCodes.length && a.sourcecountry) {
      const artCountry = a.sourcecountry.toUpperCase();
      const artCode = countryNameToCode[artCountry] ?? artCountry;
      if (!countryCodes.some((c) => c === artCode || c === artCountry)) return false;
    }
    return true;
  });
}

/**
 * Split subtopics into batches that produce queries within GDELT's character limit.
 * Each batch's keyword portion must stay under ~200 chars to leave room for locale operators.
 */
function batchSubtopics(
  subtopics: Array<{ name: string; weight: number }>
): Array<Array<{ name: string; weight: number }>> {
  const MAX_KEYWORD_CHARS = 200;
  const batches: Array<Array<{ name: string; weight: number }>> = [];
  let current: Array<{ name: string; weight: number }> = [];
  let currentLen = 0;

  for (const st of subtopics) {
    const name = st.name.toLowerCase().trim();
    const needsQuotes = name.includes(" ") || /[àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ\-]/.test(name);
    const termLen = (needsQuotes ? name.length + 2 : name.length) + 4; // +4 for " OR "

    if (current.length > 0 && currentLen + termLen > MAX_KEYWORD_CHARS) {
      batches.push(current);
      current = [];
      currentLen = 0;
    }
    current.push(st);
    currentLen += termLen;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Query GDELT and extract URLs for scraping.
 *
 * Query building priority:
 * 1. Subtopic names are always used as the keyword source (OR-joined)
 * 2. Language/region filters are appended as sourcelang:/sourcecountry: operators
 * 3. Domain rules filter the returned articles (allow/block)
 * 4. gdeltQueryParams provides overrides for advanced users (timespan, maxrecords, etc.)
 *    but does NOT override the query keywords which come from subtopics
 *
 * When subtopics produce a query longer than GDELT's limit, they are split into
 * batches and queried separately, then results are deduplicated.
 */
export async function getGDELTUrls(
  config: {
    gdeltQueryParams?: Record<string, unknown> | null;
    targetLanguages?: string[];
    targetRegions?: string[];
  },
  subtopics?: Array<{ name: string; weight: number }>,
  limit?: number,
  domainRules?: Array<{ domain: string; rule: string }>
): Promise<Array<{ url: string; metadata: Partial<GDELTArticle> }>> {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/6e8eb9c3-853c-4fd1-bcc7-b6f3071ae589',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gdelt.ts:getGDELTUrls:entry',message:'getGDELTUrls called',data:{subtopicCount:subtopics?.length,subtopicNames:subtopics?.map(s=>s.name),domainRulesCount:domainRules?.length,targetLangs:config.targetLanguages,targetRegions:config.targetRegions},timestamp:Date.now(),hypothesisId:'H1,H2,H3'})}).catch(()=>{});
  // #endregion

  // Build base overrides (timespan, maxrecords, etc.) from gdeltQueryParams
  const baseOverrides: Record<string, unknown> = {};
  if (config.gdeltQueryParams && typeof config.gdeltQueryParams === "object") {
    Object.assign(baseOverrides, config.gdeltQueryParams);
    delete baseOverrides.query;
    delete baseOverrides.keywords;
  }

  const maxRecords = limit && limit > 0
    ? Math.min(limit, 250)
    : (typeof baseOverrides.maxrecords === "number" ? Math.min(baseOverrides.maxrecords as number, 250) : 100);

  // Split subtopics into batches to avoid GDELT query-too-long errors
  const batches = subtopics && subtopics.length > 0
    ? batchSubtopics(subtopics)
    : [[]] as Array<Array<{ name: string; weight: number }>>;

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/6e8eb9c3-853c-4fd1-bcc7-b6f3071ae589',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gdelt.ts:getGDELTUrls:batches',message:'Subtopic batches',data:{batchCount:batches.length,batchSizes:batches.map(b=>b.length)},timestamp:Date.now(),hypothesisId:'H7'})}).catch(()=>{});
  // #endregion

  const allArticles: GDELTArticle[] = [];
  const seenUrls = new Set<string>();

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchSubtopics = batch.length > 0 ? batch : undefined;
    const queryParams = await buildGDELTQueryParams(config, batchSubtopics);
    Object.assign(queryParams, baseOverrides);
    queryParams.maxrecords = maxRecords;
    // Don't override keywords — they were set by buildGDELTQueryParams
    delete (queryParams as any).query;

    console.log(`[GDELT] Batch ${i + 1}/${batches.length} query:`, queryParams.keywords?.substring(0, 200));

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/6e8eb9c3-853c-4fd1-bcc7-b6f3071ae589',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gdelt.ts:getGDELTUrls:batchQuery',message:`Batch ${i+1} query`,data:{batch:i+1,totalBatches:batches.length,keywordsLen:queryParams.keywords?.length,keywords:queryParams.keywords?.substring(0,300)},timestamp:Date.now(),hypothesisId:'H7'})}).catch(()=>{});
    // #endregion

    try {
      const articles = await queryGDELT(queryParams);
      for (const a of articles) {
        if (a.url && !seenUrls.has(a.url)) {
          seenUrls.add(a.url);
          allArticles.push(a);
        }
      }
      console.log(`[GDELT] Batch ${i + 1}: ${articles.length} articles (total unique: ${allArticles.length})`);
    } catch (e) {
      console.error(`[GDELT] Batch ${i + 1} failed:`, e);
    }
  }

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/6e8eb9c3-853c-4fd1-bcc7-b6f3071ae589',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gdelt.ts:getGDELTUrls:results',message:'All batches complete',data:{totalArticles:allArticles.length,sampleTitles:allArticles.slice(0,5).map(a=>a.title),sampleDomains:allArticles.slice(0,5).map(a=>a.domain)},timestamp:Date.now(),hypothesisId:'H7'})}).catch(()=>{});
  // #endregion

  let filtered = allArticles.filter((a) => a.url && a.url.startsWith("http"));

  // Post-filter by language/country metadata
  const beforeLocale = filtered.length;
  filtered = applyLocaleFilter(filtered, config.targetLanguages ?? [], config.targetRegions ?? []);
  if (beforeLocale !== filtered.length) {
    console.log(`[GDELT] Locale filter: ${beforeLocale} -> ${filtered.length}`);
  }

  // Filter by domain rules
  if (domainRules && domainRules.length > 0) {
    const beforeDomain = filtered.length;
    filtered = applyDomainFilter(filtered, domainRules);
    console.log(`[GDELT] Domain filter: ${beforeDomain} -> ${filtered.length}`);
  }

  const urls = filtered.map((article) => ({
    url: article.url,
    metadata: {
      title: article.title,
      domain: article.domain,
      language: article.language,
      sourcecountry: article.sourcecountry,
      seendate: article.seendate,
    },
  }));

  console.log(`[GDELT] Extracted ${urls.length} valid URLs`);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/6e8eb9c3-853c-4fd1-bcc7-b6f3071ae589',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gdelt.ts:getGDELTUrls:final',message:'Final URL count',data:{finalCount:urls.length,sampleUrls:urls.slice(0,3).map(u=>({url:u.url,title:u.metadata.title}))},timestamp:Date.now(),hypothesisId:'H7',runId:'post-fix'})}).catch(()=>{});
  // #endregion
  return urls;
}
