import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ThemeSettings } from "@/components/theme-settings";

export default async function ThemeSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const theme = await prisma.theme.findUnique({
    where: { slug },
    include: {
      configs: { orderBy: { version: "desc" }, take: 1 },
      delivery: true,
      domainRules: true,
      subtopics: { orderBy: { weight: "desc" } },
    },
  });
  if (!theme) notFound();

  const config = theme.configs[0] ? {
    id: theme.configs[0].id,
    targetLanguages: theme.configs[0].targetLanguages,
    targetRegions: theme.configs[0].targetRegions,
    minTextLengthThreshold: theme.configs[0].minTextLengthThreshold,
    minQualityScore: theme.configs[0].minQualityScore,
    dailyExtractionBudget: theme.configs[0].dailyExtractionBudget,
    hourlyRateLimit: theme.configs[0].hourlyRateLimit,
    maxArticleAge: theme.configs[0].maxArticleAge,
    scheduleCron: theme.configs[0].scheduleCron,
    maxRefutedClaimsBeforeHold: theme.configs[0].maxRefutedClaimsBeforeHold,
    gdeltQueryParams: theme.configs[0].gdeltQueryParams as Record<string, unknown> | null,
  } : null;

  return (
    <ThemeSettings
      theme={theme}
      config={config}
      delivery={theme.delivery}
      domainRules={theme.domainRules}
      subtopics={theme.subtopics}
    />
  );
}
