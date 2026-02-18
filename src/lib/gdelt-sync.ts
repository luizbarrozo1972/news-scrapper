import { prisma } from "@/lib/prisma";

/**
 * Rebuild the GDELT query string from the current subtopics and persist it
 * into the latest ThemeConfig's gdeltQueryParams.query field.
 *
 * Called automatically whenever subtopics are created, updated, or deleted.
 */
export async function rebuildGdeltQueryFromSubtopics(themeId: string): Promise<void> {
  const [subtopics, latestConfig] = await Promise.all([
    prisma.subtopic.findMany({
      where: { themeId },
      orderBy: { weight: "desc" },
    }),
    prisma.themeConfig.findFirst({
      where: { themeId },
      orderBy: { version: "desc" },
    }),
  ]);

  if (!latestConfig) return;

  const query = subtopics
    .map((st) => {
      const name = st.name.trim();
      if (name.includes(" ") || /[àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ\-]/.test(name)) {
        return `"${name}"`;
      }
      return name;
    })
    .join(" OR ") || "";

  const existing = (latestConfig.gdeltQueryParams as Record<string, unknown>) ?? {};
  const updated = { ...existing, query };

  await prisma.themeConfig.update({
    where: { id: latestConfig.id },
    data: { gdeltQueryParams: updated },
  });

  console.log(`[GDELT-sync] Updated query for theme ${themeId}: ${query}`);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/6e8eb9c3-853c-4fd1-bcc7-b6f3071ae589',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gdelt-sync.ts:rebuildGdeltQueryFromSubtopics',message:'Rebuilt query from subtopics',data:{themeId,subtopicCount:subtopics.length,subtopicNames:subtopics.map(s=>s.name),generatedQuery:query},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
  // #endregion
}
