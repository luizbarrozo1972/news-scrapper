import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { rebuildGdeltQueryFromSubtopics } from "@/lib/gdelt-sync";

const schema = z.object({
  objectives: z.string().min(1),
  targetLanguages: z.array(z.string()).optional(),
  targetRegions: z.array(z.string()).optional(),
});

// Helper to derive slug from name
function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

// Map language names to ISO codes
function mapLanguage(lang: string): string {
  const langMap: Record<string, string> = {
    português: "pt",
    portugues: "pt",
    pt: "pt",
    inglês: "en",
    ingles: "en",
    en: "en",
    espanhol: "es",
    espanol: "es",
    es: "es",
    francês: "fr",
    frances: "fr",
    fr: "fr",
  };
  return langMap[lang.toLowerCase().trim()] || lang.toLowerCase().trim();
}

// Map region names to ISO codes
function mapRegion(region: string): string {
  const regionMap: Record<string, string> = {
    brasil: "BR",
    brazil: "BR",
    br: "BR",
    "estados unidos": "US",
    "united states": "US",
    us: "US",
    usa: "US",
    europa: "EU",
    europe: "EU",
    eu: "EU",
    ásia: "AS",
    asia: "AS",
    as: "AS",
  };
  const normalized = region.toLowerCase().trim();
  return regionMap[normalized] || normalized.toUpperCase();
}

export async function POST(
  request: Request,
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

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const objectives = parsed.data.objectives;
    const explicitLanguages = parsed.data.targetLanguages;
    const explicitRegions = parsed.data.targetRegions;

    const VERTEX_API = process.env.GOOGLE_VERTEX_API_KEY || process.env.GEMINI_API_KEY;
    
    let aiConfig: {
      subtopics: Array<{ name: string; slug: string; weight: number }>;
      targetLanguages: string[];
      targetRegions: string[];
      trustedDomains: string[];
      dailyExtractionBudget: number;
      minTextLengthThreshold: number;
      minQualityScore: number;
      gdeltQueryParams?: Record<string, unknown>;
      preferences?: string[];
    };

    if (VERTEX_API) {
      const explicitLocaleInfo = (explicitLanguages?.length || explicitRegions?.length)
        ? `\n\nIMPORTANT: User has explicitly selected:\n${explicitLanguages?.length ? `- Languages: ${explicitLanguages.join(", ")}\n` : ""}${explicitRegions?.length ? `- Regions: ${explicitRegions.join(", ")}\n` : ""}Use these exact values in your response. Do NOT extract different languages/regions from the objectives text.`
        : "";

      const prompt = `You are a config assistant for a news scraping platform that uses GDELT as the news source. Given user objectives (in any language), extract configuration that WILL WORK with GDELT.

User objectives:
"""
${objectives}
"""${explicitLocaleInfo}

Theme name: ${theme.name}

═══════════════════════════════════════════════════════════════
CRITICAL — How GDELT search works (you MUST follow these rules):
═══════════════════════════════════════════════════════════════

1. GDELT machine-translates ALL articles to English, then searches the English text.
2. When targetLanguages/targetRegions are set, the system builds:
   (ENGLISH keywords) sourcelang:LANGUAGE sourcecountry:COUNTRY
3. GDELT REJECTS queries with accented/special characters (ações, inflação, câmbio) when combined with locale filters. The "query" field MUST be ASCII-only English.

═══════════════════════════════════════════════════════════════
CRITICAL — How to write good GDELT keywords:
═══════════════════════════════════════════════════════════════

GDELT uses OR logic — ANY article matching ANY keyword is returned.
Single generic words cause massive irrelevant results!

❌ BAD (too generic, matches unrelated articles):
   "results" → matches sports results, election results, test results
   "interest" → matches human interest stories, points of interest
   "market" → matches supermarket, flea market, market square
   "stocks" → matches livestock stocks, food stocks

✅ GOOD (specific compound phrases with quotes):
   "financial results" or "quarterly earnings"
   "interest rate" or "benchmark rate"
   "stock market" or "financial market" or "stock exchange"
   "crude oil" (not just "oil")
   "economic growth" (not just "growth")
   "central bank" (not just "bank")
   "exchange rate" (not just "exchange")
   "monetary policy" (not just "policy")

RULES FOR query FIELD:
- Use 6–12 terms joined by OR for good coverage
- Use QUOTED phrases ("...") ONLY for compound terms that would be too generic alone
- Use UNQUOTED single words when they are already specific: inflation, GDP, dividends, recession, unemployment, IPO, ETF, commodities, Bovespa, Selic, economy
- NEVER use these words ALONE (without quotes): results, interest, market, stocks, exchange, bank, oil, growth, policy, companies, trade. Always pair them: "stock market", "interest rate", "financial results", etc.
- Include proper nouns and domain-specific terms that don't need quotes: Bovespa, Ibovespa, Selic, Nasdaq, S&P500, Bitcoin, etc.
- Balance: mix ~4 quoted phrases with ~4-6 specific single words for good recall + precision
- Translate ALL user topics into English

targetLanguages: use 2-letter ISO codes: pt, en, es, fr, de, it, etc.
targetRegions: use 2-letter FIPS codes: BR, US, AR, MX, ES, FR, DE, GB, etc.

Extract and output ONLY valid JSON (no markdown, no code blocks):
{
  "subtopics": [
    {"name": "string (any language for display)", "slug": "string (lowercase, hyphenated)", "weight": number (0.5-2.0)}
  ],
  "targetLanguages": ["pt" or "en" etc],
  "targetRegions": ["BR" or "US" etc],
  "trustedDomains": ["domain.com"],
  "dailyExtractionBudget": number,
  "minTextLengthThreshold": number,
  "minQualityScore": number (0.0-1.0),
  "gdeltQueryParams": {
    "query": "ENGLISH keywords with quoted phrases — see rules above",
    "mode": "artlist",
    "maxrecords": number (100-250)
  },
  "preferences": ["string array of preferences mentioned"]
}

RULES:
1. Extract ALL subtopics mentioned. Names can be in the user's language for display; slugs lowercase-hyphenated.
2. Weight subtopics by importance: core topics = 1.5–2.0, secondary = 1.0–1.3.
3. Do NOT put timespan in gdeltQueryParams. Set maxrecords between 100–250.
4. Extract trusted domains from mentions.

EXAMPLES:

User: "Rastrear notícias de mercado financeiro no Brasil em português: ações, dividendos, juros, inflação, câmbio, resultados trimestrais, IPOs"
→ targetLanguages: ["pt"], targetRegions: ["BR"]
→ query: "(\\"stock market\\" OR \\"interest rate\\" OR \\"exchange rate\\" OR inflation OR dividends OR GDP OR economy OR IPO OR ETF OR Bovespa OR Selic OR recession)"

User: "Track US tech industry news: AI, semiconductors, cloud computing, startups, venture capital"
→ targetLanguages: ["en"], targetRegions: ["US"]
→ query: "(\\"artificial intelligence\\" OR semiconductors OR \\"cloud computing\\" OR startups OR \\"venture capital\\" OR Nvidia OR OpenAI OR technology)"

User: "Política e economia Argentina: eleições, banco central, dólar, inflação"
→ targetLanguages: ["es"], targetRegions: ["AR"]
→ query: "(elections OR \\"central bank\\" OR dollar OR inflation OR \\"economic policy\\" OR economy OR GDP OR recession OR Milei)"

Output ONLY the JSON object, nothing else.`;

      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${VERTEX_API}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 2048,
              },
            }),
          }
        );

        if (res.ok) {
          const data = await res.json();
          const text =
            data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            aiConfig = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error("No JSON found in AI response");
          }
        } else {
          throw new Error(`AI API error: ${res.status}`);
        }
      } catch (aiError) {
        console.error("[AI Config] AI request failed:", aiError);
        aiConfig = parseObjectivesFallback(objectives);
      }
    } else {
      aiConfig = parseObjectivesFallback(objectives);
    }

    // Use explicit values if provided, otherwise use AI-parsed values
    const targetLanguages = explicitLanguages && explicitLanguages.length > 0
      ? explicitLanguages.filter((lang, idx, arr) => arr.indexOf(lang) === idx) // unique
      : (aiConfig.targetLanguages || [])
          .map(mapLanguage)
          .filter((lang, idx, arr) => arr.indexOf(lang) === idx); // unique

    const targetRegions = explicitRegions && explicitRegions.length > 0
      ? explicitRegions.filter((region, idx, arr) => arr.indexOf(region) === idx) // unique
      : (aiConfig.targetRegions || [])
          .map(mapRegion)
          .filter((region, idx, arr) => arr.indexOf(region) === idx); // unique

    // Create/update subtopics
    const createdSubtopics = [];
    for (const subtopic of aiConfig.subtopics || []) {
      const subtopicSlug = subtopic.slug || deriveSlug(subtopic.name);
      try {
        const created = await prisma.subtopic.upsert({
          where: {
            themeId_slug: {
              themeId: theme.id,
              slug: subtopicSlug,
            },
          },
          update: {
            name: subtopic.name,
            weight: subtopic.weight || 1.0,
          },
          create: {
            themeId: theme.id,
            name: subtopic.name,
            slug: subtopicSlug,
            weight: subtopic.weight || 1.0,
          },
        });
        createdSubtopics.push(created);
      } catch (e) {
        console.error(`[AI Config] Failed to create subtopic ${subtopic.name}:`, e);
      }
    }

    // Create domain rules for trusted domains
    const createdDomainRules = [];
    for (const domain of aiConfig.trustedDomains || []) {
      const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
      try {
        const created = await prisma.domainRule.upsert({
          where: {
            themeId_domain: {
              themeId: theme.id,
              domain: cleanDomain,
            },
          },
          update: {
            rule: "allow",
          },
          create: {
            themeId: theme.id,
            domain: cleanDomain,
            rule: "allow",
          },
        });
        createdDomainRules.push(created);
      } catch (e) {
        console.error(`[AI Config] Failed to create domain rule for ${domain}:`, e);
      }
    }

    // Use gdeltQueryParams from AI if provided, otherwise build defaults
    let gdeltQueryParams = aiConfig.gdeltQueryParams;
    if (!gdeltQueryParams) {
      gdeltQueryParams = {
        mode: "artlist",
        format: "json",
        maxrecords: Math.min(aiConfig.dailyExtractionBudget || 100, 250),
      };
    }
    // Remove query/keywords from AI-generated params — actual keywords always come from subtopics
    delete gdeltQueryParams.query;
    delete (gdeltQueryParams as Record<string, unknown>).keywords;

    // Create config version
    const lastConfig = await prisma.themeConfig.findFirst({
      where: { themeId: theme.id },
      orderBy: { version: "desc" },
    });
    const version = (lastConfig?.version ?? 0) + 1;

    const config = await prisma.themeConfig.create({
      data: {
        themeId: theme.id,
        version,
        targetLanguages: targetLanguages.length > 0 ? targetLanguages : ["en"],
        targetRegions: targetRegions.length > 0 ? targetRegions : ["US"],
        dailyExtractionBudget: aiConfig.dailyExtractionBudget || 500,
        minTextLengthThreshold: aiConfig.minTextLengthThreshold || 500,
        minQualityScore: aiConfig.minQualityScore || 0.6,
        gdeltQueryParams: gdeltQueryParams ? (gdeltQueryParams as object) : undefined,
        createdBy: session.user.id,
        changeReason: `AI-generated from objectives: ${objectives.substring(0, 200)}`,
      },
    });

    // Sync the GDELT query field from the subtopics that were just created
    await rebuildGdeltQueryFromSubtopics(theme.id);

    // Re-read the config to get the updated gdeltQueryParams
    const updatedConfig = await prisma.themeConfig.findUnique({ where: { id: config.id } });

    return NextResponse.json({
      config: {
        id: config.id,
        version: config.version,
        targetLanguages: config.targetLanguages,
        targetRegions: config.targetRegions,
        dailyExtractionBudget: config.dailyExtractionBudget,
        minTextLengthThreshold: config.minTextLengthThreshold,
        minQualityScore: config.minQualityScore,
        gdeltQueryParams: updatedConfig?.gdeltQueryParams ?? config.gdeltQueryParams,
      },
      subtopics: createdSubtopics,
      domainRules: createdDomainRules,
      message: VERTEX_API ? "Configuration generated successfully" : "Configuration generated using fallback parser",
    });
  } catch (e) {
    console.error("[AI Config] Error:", e);
    return NextResponse.json(
      {
        error: "Failed to generate configuration",
        message: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

function parseObjectivesFallback(objectives: string) {
  const lower = objectives.toLowerCase();
  
  // Extract subtopics
  const subtopics: Array<{ name: string; slug: string; weight: number }> = [];
  
  const subtopicKeywords: Record<string, { name: string; weight: number }> = {
    ações: { name: "Ações", weight: 1.5 },
    dividendos: { name: "Dividendos", weight: 1.3 },
    "resultados trimestrais": { name: "Resultados Trimestrais", weight: 1.8 },
    resultados: { name: "Resultados", weight: 1.6 },
    juros: { name: "Juros", weight: 1.8 },
    inflação: { name: "Inflação", weight: 1.8 },
    inflacao: { name: "Inflação", weight: 1.8 },
    câmbio: { name: "Câmbio", weight: 1.5 },
    cambio: { name: "Câmbio", weight: 1.5 },
    macroeconomia: { name: "Macroeconomia", weight: 1.7 },
    empresas: { name: "Empresas", weight: 1.4 },
    ipos: { name: "IPOs", weight: 1.5 },
    etfs: { name: "ETFs", weight: 1.3 },
    "eventos corporativos": { name: "Eventos Corporativos", weight: 1.4 },
    earnings: { name: "Earnings", weight: 1.6 },
    rates: { name: "Rates", weight: 1.8 },
    dividends: { name: "Dividends", weight: 1.3 },
  };

  for (const [keyword, info] of Object.entries(subtopicKeywords)) {
    if (lower.includes(keyword)) {
      subtopics.push({
        ...info,
        slug: deriveSlug(info.name),
      });
    }
  }

  if (subtopics.length === 0) {
    subtopics.push({ name: "General", slug: "general", weight: 1.0 });
  }

  // Extract languages
  const languages: string[] = [];
  if (lower.includes("português") || lower.includes("portugues") || lower.includes("pt")) {
    languages.push("pt");
  }
  if (lower.includes("inglês") || lower.includes("ingles") || lower.includes("en") || lower.includes("english")) {
    languages.push("en");
  }
  if (languages.length === 0) languages.push("en");

  // Extract regions
  const regions: string[] = [];
  if (lower.includes("brasil") || lower.includes("brazil") || lower.includes("br")) {
    regions.push("BR");
  }
  if (lower.includes("estados unidos") || lower.includes("united states") || lower.includes("us") || lower.includes("usa")) {
    regions.push("US");
  }
  if (lower.includes("europa") || lower.includes("europe") || lower.includes("eu")) {
    regions.push("EU");
  }
  if (lower.includes("ásia") || lower.includes("asia") || lower.includes("as")) {
    regions.push("AS");
  }
  if (regions.length === 0) regions.push("US");

  // Extract trusted domains
  const trustedDomains: string[] = [];
  const domainKeywords: Record<string, string> = {
    reuters: "reuters.com",
    bloomberg: "bloomberg.com",
    cnbc: "cnbc.com",
    valor: "valor.com.br",
    infomoney: "infomoney.com.br",
    investing: "investing.com",
    financial: "ft.com",
    "wall street": "wsj.com",
  };

  for (const [keyword, domain] of Object.entries(domainKeywords)) {
    if (lower.includes(keyword)) {
      trustedDomains.push(domain);
    }
  }
  if (trustedDomains.length === 0) {
    trustedDomains.push("reuters.com");
  }

  // Extract budget
  const budgetMatch = objectives.match(/(\d+)\s*[-–—]\s*(\d+)\s*(items?|extractions?|itens?)/i) ||
                      objectives.match(/(\d+)\s*(items?|extractions?|itens?)\s*por\s*dia/i) ||
                      objectives.match(/(\d+)\s*(items?|extractions?|itens?)/i);
  
  let dailyExtractionBudget = 500;
  if (budgetMatch) {
    if (budgetMatch[2]) {
      // Range: use max
      dailyExtractionBudget = Math.max(parseInt(budgetMatch[1], 10), parseInt(budgetMatch[2], 10));
    } else {
      dailyExtractionBudget = parseInt(budgetMatch[1], 10);
    }
  }

  return {
    subtopics,
    targetLanguages: languages,
    targetRegions: regions,
    trustedDomains,
    dailyExtractionBudget,
    minTextLengthThreshold: 500,
    minQualityScore: 0.6,
    preferences: lower.includes("market-moving") || lower.includes("mexe com mercado") 
      ? ["market-moving", "relevante"] 
      : [],
  };
}
