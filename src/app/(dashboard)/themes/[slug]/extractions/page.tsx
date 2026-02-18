"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useExtractionProgress } from "@/contexts/extraction-progress-context";

type Extraction = {
  id: string;
  headline: string | null;
  sourceDomain: string | null;
  extractionMethod: string;
  qualityScore: number | null;
  publishedAt: string | null;
  scrapedAt: string;
  newsItem: {
    deliveryStatus: string | null;
  } | null;
};

export default function ExtractionsPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { startExtraction } = useExtractionProgress();
  const [items, setItems] = useState<Extraction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const limit = 25;

  const fetchExtractions = async (pageNum: number = page) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/themes/${slug}/extractions?limit=${limit}&page=${pageNum}`
      );
      const data = await res.json();
      const newItems = data.items ?? [];
      setItems(newItems);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      setPage(data.page ?? pageNum);
      // Clear selection for items that are no longer on the current page
      setSelectedIds((prev) => {
        const newSet = new Set<string>();
        newItems.forEach((item: Extraction) => {
          if (prev.has(item.id)) {
            newSet.add(item.id);
          }
        });
        return newSet;
      });
    } catch {
      setItems([]);
      setTotal(0);
      setTotalPages(1);
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExtractions(1);
    setSelectedIds(new Set());
  }, [slug]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchExtractions(newPage);
    }
  };

  const triggerIngestion = async () => {
    setTriggering(true);
    try {
      const res = await fetch(`/api/themes/${slug}/ingestion/trigger`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ingestionJobId) {
          startExtraction(slug, data.ingestionJobId);
        }
      }
      // Wait a bit for workers to process before refreshing
      await new Promise(resolve => setTimeout(resolve, 3000));
      await fetchExtractions(1);
    } catch {
      /* ignore */
    } finally {
      setTriggering(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(items.map((item) => item.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectItem = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;

    const confirmed = window.confirm(
      `Tem certeza que deseja deletar ${selectedIds.size} extração(ões)? Esta ação não pode ser desfeita.`
    );

    if (!confirmed) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/themes/${slug}/extractions`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(`Erro ao deletar: ${error.error || "Erro desconhecido"}`);
        return;
      }

      setSelectedIds(new Set());
      await fetchExtractions(page);
    } catch (error) {
      alert(`Erro ao deletar: ${error instanceof Error ? error.message : "Erro desconhecido"}`);
    } finally {
      setDeleting(false);
    }
  };

  const allSelected = items.length > 0 && selectedIds.size === items.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < items.length;

  return (
    <div className="space-y-6 min-w-0">
      <Card>
        <CardHeader>
          <CardTitle>Extractions</CardTitle>
          <CardDescription>Extracted articles for this theme</CardDescription>
          <CardAction>
            <Button onClick={triggerIngestion} disabled={triggering}>
              {triggering ? "Running..." : "Run ingestion"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">Loading extractions...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground mb-4">
                No extractions yet. Run ingestion to start.
              </p>
              <Button onClick={triggerIngestion} disabled={triggering}>
                {triggering ? "Running..." : "Run ingestion"}
              </Button>
            </div>
          ) : (
            <>
              {selectedIds.size > 0 && (
                <div className="flex items-center justify-between p-4 mb-4 bg-muted/50 rounded-md border">
                  <div className="text-sm font-medium">
                    {selectedIds.size} extração(ões) selecionada(s)
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteSelected}
                    disabled={deleting}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {deleting ? "Deletando..." : `Deletar ${selectedIds.size}`}
                  </Button>
                </div>
              )}
              <Table>
                <TableCaption>
                  Showing {items.length} of {total} extractions
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(input) => {
                          if (input) input.indeterminate = someSelected;
                        }}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    </TableHead>
                    <TableHead className="w-[180px]">Publicado</TableHead>
                    <TableHead className="w-[180px]">Extraído</TableHead>
                    <TableHead>Headline</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="w-[100px]">Quality</TableHead>
                    <TableHead className="w-[120px]">Delivery</TableHead>
                    <TableHead className="text-right w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={(e) => handleSelectItem(item.id, e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {item.publishedAt 
                          ? new Date(item.publishedAt).toLocaleString()
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {new Date(item.scrapedAt).toLocaleString()}
                      </TableCell>
                    <TableCell className="font-medium">
                      <Link
                        href={`/themes/${slug}/extractions/${item.id}`}
                        className="hover:underline"
                      >
                        {item.headline?.slice(0, 60) ?? "—"}
                        {(item.headline?.length ?? 0) > 60 ? "..." : ""}
                      </Link>
                    </TableCell>
                    <TableCell>{item.sourceDomain ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.extractionMethod}</Badge>
                    </TableCell>
                    <TableCell>
                      {(item.qualityScore ?? 0).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          item.newsItem?.deliveryStatus === "sent"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {item.newsItem?.deliveryStatus ?? "pending"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/themes/${slug}/extractions/${item.id}`}>
                          View
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                </TableBody>
              </Table>
            </>
          )}
          {!loading && items.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Página {page} de {totalPages} • {total} extrações no total
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 1 || loading}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={page === pageNum ? "default" : "outline"}
                        size="sm"
                        onClick={() => handlePageChange(pageNum)}
                        disabled={loading}
                        className="min-w-[2.5rem]"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page === totalPages || loading}
                >
                  Próxima
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
