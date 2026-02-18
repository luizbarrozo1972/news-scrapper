import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const configSchema = z.object({
  targetLanguages: z.array(z.string()).optional(),
  targetRegions: z.array(z.string()).optional(),
  minTextLengthThreshold: z.number().int().min(0).optional(),
  minQualityScore: z.number().min(0).max(1).optional(),
  qualityFlagsHandling: z.record(z.string(), z.string()).optional(),
  maxRefutedClaimsBeforeHold: z.number().int().optional().nullable(),
  scheduleCron: z.string().optional().nullable(),
  dailyExtractionBudget: z.number().int().min(0).optional(),
  hourlyRateLimit: z.number().int().optional().nullable(),
  maxArticleAge: z.string().optional().nullable(), // GDELT timespan: "24h", "7d", "30d", etc.
  gdeltQueryParams: z.record(z.string(), z.unknown()).optional().nullable(),
});

export async function GET(
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

  const config = await prisma.themeConfig.findFirst({
    where: { themeId: theme.id },
    orderBy: { version: "desc" },
  });
  return NextResponse.json(config ?? {});
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
    const parsed = configSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const last = await prisma.themeConfig.findFirst({
      where: { themeId: theme.id },
      orderBy: { version: "desc" },
    });
    const version = (last?.version ?? 0) + 1;

    // Merge maxArticleAge into gdeltQueryParams if provided
    let gdeltQueryParams = parsed.data.gdeltQueryParams ?? (last?.gdeltQueryParams as Record<string, unknown> | null) ?? {};
    if (parsed.data.maxArticleAge !== undefined) {
      gdeltQueryParams = { ...gdeltQueryParams };
      if (parsed.data.maxArticleAge) {
        gdeltQueryParams.timespan = parsed.data.maxArticleAge;
      } else {
        // Remove timespan if maxArticleAge is empty/null
        delete gdeltQueryParams.timespan;
      }
    } else if (last?.maxArticleAge) {
      // Preserve existing maxArticleAge if not provided
      gdeltQueryParams = { ...gdeltQueryParams, timespan: last.maxArticleAge };
    }

    const config = await prisma.themeConfig.create({
      data: {
        themeId: theme.id,
        version,
        targetLanguages: parsed.data.targetLanguages ?? last?.targetLanguages ?? ["en"],
        targetRegions: parsed.data.targetRegions ?? last?.targetRegions ?? ["US"],
        minTextLengthThreshold: parsed.data.minTextLengthThreshold ?? last?.minTextLengthThreshold ?? 500,
        minQualityScore: parsed.data.minQualityScore ?? last?.minQualityScore ?? 0.6,
        qualityFlagsHandling: parsed.data.qualityFlagsHandling ?? (last?.qualityFlagsHandling as object | null) ?? undefined,
        maxRefutedClaimsBeforeHold: parsed.data.maxRefutedClaimsBeforeHold ?? last?.maxRefutedClaimsBeforeHold,
        scheduleCron: parsed.data.scheduleCron ?? last?.scheduleCron,
        dailyExtractionBudget: parsed.data.dailyExtractionBudget ?? last?.dailyExtractionBudget ?? 500,
        hourlyRateLimit: parsed.data.hourlyRateLimit ?? last?.hourlyRateLimit,
        maxArticleAge: parsed.data.maxArticleAge ?? last?.maxArticleAge ?? null,
        gdeltQueryParams: Object.keys(gdeltQueryParams).length > 0 ? gdeltQueryParams : undefined,
        createdBy: session.user.id,
      },
    });
    return NextResponse.json(config);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to create config" },
      { status: 500 }
    );
  }
}
