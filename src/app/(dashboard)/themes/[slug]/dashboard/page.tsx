import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TrendingUp, TrendingDown, Package, AlertCircle } from "lucide-react";
import { DailyBudgetCard } from "@/components/daily-budget-card";

export default async function ThemeDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const theme = await prisma.theme.findUnique({
    where: { slug },
  });
  if (!theme) notFound();

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [
    extractedCount,
    successCount,
    budget,
    sentCount,
    heldCount,
    config,
  ] = await Promise.all([
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
    prisma.dailyBudgetUsage.findUnique({
      where: {
        themeId_date: { themeId: theme.id, date: today },
      },
    }),
    prisma.newsItem.count({
      where: {
        themeId: theme.id,
        deliveryStatus: "sent",
        createdAt: { gte: dayAgo },
      },
    }),
    prisma.newsItem.count({
      where: {
        themeId: theme.id,
        deliveryStatus: "held",
        createdAt: { gte: dayAgo },
      },
    }),
    prisma.themeConfig.findFirst({
      where: { themeId: theme.id },
      orderBy: { version: "desc" },
    }),
  ]);

  const limit = config?.dailyExtractionBudget ?? 500;
  const used = budget?.used ?? 0;
  const dailyBudget = { used, limit };
  const successRate = extractedCount > 0 ? (successCount / extractedCount) * 100 : 0;

  const failures = Math.max(0, extractedCount - successCount);
  const budgetPercent =
    dailyBudget?.limit
      ? Math.min(100, ((dailyBudget?.used ?? 0) / dailyBudget.limit) * 100)
      : 0;

  return (
    <div className="space-y-6 min-w-0">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Overview</h2>
        <p className="text-muted-foreground">
          Monitor your theme performance and usage
        </p>
      </div>

      <DailyBudgetCard
        slug={slug}
        used={dailyBudget?.used ?? 0}
        limit={dailyBudget?.limit ?? 500}
        budgetPercent={budgetPercent}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(successRate ?? 0).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">Last 24 hours</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sent</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sentCount}</div>
            <p className="text-xs text-muted-foreground">Last 24 hours</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Held</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{heldCount}</div>
            <p className="text-xs text-muted-foreground">Last 24 hours</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failures</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{failures}</div>
            <p className="text-xs text-muted-foreground">Last 24 hours</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity Summary</CardTitle>
          <CardDescription>
            Extraction and delivery statistics for the last 24 hours
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total Extracted</span>
              <span className="text-sm font-bold">{extractedCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Successfully Delivered</span>
              <span className="text-sm font-bold">{sentCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Held for Review</span>
              <span className="text-sm font-bold">{heldCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Failed</span>
              <span className="text-sm font-bold">{failures}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
