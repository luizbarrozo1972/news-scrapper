import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function ExtractionDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const theme = await prisma.theme.findUnique({
    where: { slug },
  });
  if (!theme) notFound();

  const doc = await prisma.extractedDocument.findFirst({
    where: { id, themeId: theme.id },
    include: {
      newsItem: {
        include: { claims: { include: { evidences: true } } },
      },
    },
  });
  if (!doc) notFound();

  const deliveryLogs = await prisma.deliveryLog.findMany({
    where: { themeId: theme.id, newsItemId: doc.newsItem?.id },
  });

  return (
    <div className="space-y-6">
      <Link
        href={`/themes/${slug}/extractions`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Back to list
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>{doc.headline ?? "No headline"}</CardTitle>
          <CardDescription>
            URL: {doc.canonicalUrl ?? "—"} | Domain:{" "}
            {doc.sourceDomain} | {new Date(doc.scrapedAt).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">
            Method: {doc.extractionMethod} | Text length: {doc.textLength} |
            Quality: {(doc.qualityScore ?? 0).toFixed(2)}
          </p>
        </CardContent>
      </Card>

      {doc.newsItem?.summaryEditorial && (
        <Card>
          <CardHeader>
            <CardTitle>Summary (editorial)</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{doc.newsItem.summaryEditorial}</p>
          </CardContent>
        </Card>
      )}

      {doc.newsItem?.claims && doc.newsItem.claims.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Claims & Fact-check</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {doc.newsItem.claims.map((claim, i) => (
              <div
                key={claim.id}
                className="border rounded p-4 space-y-2"
              >
                <p className="font-medium">
                  {i + 1}. &quot;{claim.text}&quot;
                </p>
                <div className="flex gap-2">
                  <Badge variant="secondary">
                    {claim.factCheckVerdict ?? "unverified"}
                  </Badge>
                  {claim.factCheckConfidence != null && (
                    <span className="text-sm text-muted-foreground">
                      conf: {claim.factCheckConfidence.toFixed(2)}
                    </span>
                  )}
                </div>
                {claim.evidences?.length ? (
                  <p className="text-sm text-muted-foreground">
                    Evidence: {claim.evidences.map((e) => e.ref).join(", ")}
                  </p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {deliveryLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Delivery log</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {deliveryLogs.map((log) => (
                <li key={log.id} className="text-sm">
                  {new Date(log.attemptedAt).toLocaleString()} |{" "}
                  {log.statusCode ?? "—"} | {log.errorMsg ?? "OK"}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Full JSON</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="rounded bg-muted p-4 text-xs overflow-auto max-h-96">
            {JSON.stringify(
              doc.newsItem?.payload ?? {
                url: doc.canonicalUrl,
                headline: doc.headline,
                cleanText: doc.cleanText.slice(0, 500) + "...",
              },
              null,
              2
            )}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
