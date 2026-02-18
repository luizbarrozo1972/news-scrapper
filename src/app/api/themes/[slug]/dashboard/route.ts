import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [extractedCount, successCount, failedCount, heldCount, sentCount, budget] =
    await Promise.all([
      prisma.extractedDocument.count({
        where: { themeId: theme.id, scrapedAt: { gte: dayAgo } },
      }),
      prisma.extractedDocument.count({
        where: {
          themeId: theme.id,
          scrapedAt: { gte: dayAgo },
          qualityScore: { gte: 0.6 },
        },
      }),
      prisma.extractedDocument.count({
        where: {
          themeId: theme.id,
          scrapedAt: { gte: dayAgo },
          scrapeJob: { status: "failed" },
        },
      }),
      prisma.newsItem.count({
        where: {
          themeId: theme.id,
          deliveryStatus: "held",
          createdAt: { gte: dayAgo },
        },
      }),
      prisma.newsItem.count({
        where: {
          themeId: theme.id,
          deliveryStatus: "sent",
          createdAt: { gte: dayAgo },
        },
      }),
      prisma.dailyBudgetUsage.findUnique({
        where: {
          themeId_date: {
            themeId: theme.id,
            date: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          },
        },
      }),
    ]);

  const config = await prisma.themeConfig.findFirst({
    where: { themeId: theme.id },
    orderBy: { version: "desc" },
  });
  const limit = config?.dailyExtractionBudget ?? 500;
  const used = budget?.used ?? 0;

  return NextResponse.json({
    successRate: extractedCount > 0 ? (successCount / extractedCount) * 100 : 0,
    failures: failedCount,
    sent: sentCount,
    held: heldCount,
    dailyBudget: { used, limit },
    extractedLast24h: extractedCount,
  });
}
