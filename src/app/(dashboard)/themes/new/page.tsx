"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function NewThemePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const deriveSlug = (n: string) =>
    n
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-");
  
  const validateSlug = (s: string): boolean => {
    return /^[a-z0-9-]+$/.test(s) && s.length > 0;
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Back to Themes
        </Link>
      </div>
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Create Theme</CardTitle>
          <CardDescription>Add a new scraping theme</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              setLoading(true);
              try {
                const finalSlug = (slug || deriveSlug(name)).trim().toLowerCase();
                
                if (!name.trim()) {
                  setError("Name is required");
                  setLoading(false);
                  return;
                }
                
                if (!finalSlug) {
                  setError("Slug cannot be empty. Please enter a valid slug.");
                  setLoading(false);
                  return;
                }
                
                if (!validateSlug(finalSlug)) {
                  setError("Slug can only contain lowercase letters, numbers, and hyphens");
                  setLoading(false);
                  return;
                }
                
                const payload = {
                  name: name.trim(),
                  slug: finalSlug,
                  ...(description.trim() && { description: description.trim() }),
                };
                
                console.log("Sending payload:", payload);
                
                const res = await fetch("/api/themes", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });
                const data = await res.json();
                if (!res.ok) {
                  console.error("API error:", data);
                  const errorMessage = 
                    data.error?.slug?.[0] ??
                    data.error?.name?.[0] ??
                    data.message ??
                    data.error ??
                    "Failed to create theme";
                  setError(errorMessage);
                  return;
                }
                router.push(`/themes/${data.slug}`);
                router.refresh();
              } catch (err) {
                console.error("Request error:", err);
                setError("Network error. Please check your connection.");
              } finally {
                setLoading(false);
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slug) setSlug(deriveSlug(e.target.value));
                }}
                placeholder="Market News"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => {
                  const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                  setSlug(value);
                }}
                placeholder="market-news"
                pattern="[a-z0-9-]+"
                title="Only lowercase letters, numbers, and hyphens allowed"
              />
              <p className="text-xs text-muted-foreground">
                Only lowercase letters, numbers, and hyphens. Auto-generated from name if left empty.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Scrape market and financial news"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
