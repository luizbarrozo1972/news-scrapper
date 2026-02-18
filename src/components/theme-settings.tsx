"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Check, ChevronsUpDown, X, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { GDELT_LANGUAGES, GDELT_COUNTRIES } from "@/lib/gdelt-constants";
import { cn } from "@/lib/utils";

type Config = {
  id?: string;
  targetLanguages?: string[];
  targetRegions?: string[];
  minTextLengthThreshold?: number;
  minQualityScore?: number;
  dailyExtractionBudget?: number;
  hourlyRateLimit?: number | null;
  maxArticleAge?: string | null; // GDELT timespan: "24h", "7d", "30d", etc.
  scheduleCron?: string | null;
  maxRefutedClaimsBeforeHold?: number | null;
  gdeltQueryParams?: Record<string, unknown> | null;
};

type Delivery = {
  id: string;
  url: string;
} | null;

type DomainRule = {
  id: string;
  domain: string;
  rule: string;
};

type Subtopic = {
  id: string;
  name: string;
  slug: string;
  weight: number;
};

type Theme = {
  id: string;
  slug: string;
};

export function ThemeSettings({
  theme,
  config,
  delivery,
  domainRules,
  subtopics: initialSubtopics,
}: {
  theme: Theme;
  config: Config | null;
  delivery: Delivery;
  domainRules: DomainRule[];
  subtopics: Subtopic[];
}) {
  const router = useRouter();
  const [subtopics, setSubtopics] = useState<Subtopic[]>(initialSubtopics);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(
    config?.targetLanguages ?? []
  );
  const [selectedRegions, setSelectedRegions] = useState<string[]>(
    config?.targetRegions ?? []
  );
  const [langPopoverOpen, setLangPopoverOpen] = useState(false);
  const [regionPopoverOpen, setRegionPopoverOpen] = useState(false);
  const [budget, setBudget] = useState(config?.dailyExtractionBudget ?? 500);
  const [hourlyLimit, setHourlyLimit] = useState(config?.hourlyRateLimit ?? null);
  const [maxArticleAge, setMaxArticleAge] = useState<string>(config?.maxArticleAge ?? "");
  const [minLen, setMinLen] = useState(config?.minTextLengthThreshold ?? 500);
  const [minQuality, setMinQuality] = useState(config?.minQualityScore ?? 0.6);
  const [cron, setCron] = useState(config?.scheduleCron ?? "");
  const [maxRefuted, setMaxRefuted] = useState(
    config?.maxRefutedClaimsBeforeHold ?? 2
  );
  const [gdeltParams, setGdeltParams] = useState(
    config?.gdeltQueryParams ? JSON.stringify(config.gdeltQueryParams, null, 2) : ""
  );

  // Derive the GDELT query preview from subtopics
  const derivedGdeltQuery = subtopics
    .map((st) => {
      const name = st.name.trim();
      if (name.includes(" ") || /[àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ\-]/.test(name)) {
        return `"${name}"`;
      }
      return name;
    })
    .join(" OR ") || "(no subtopics defined)";
  const [deliveryUrl, setDeliveryUrl] = useState(delivery?.url ?? "");
  const [deliverySecret, setDeliverySecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resettingBudget, setResettingBudget] = useState(false);

  // Domain rules state
  const [rules, setRules] = useState<DomainRule[]>(domainRules);
  const [newDomain, setNewDomain] = useState("");
  const [newDomainRule, setNewDomainRule] = useState<"allow" | "block">("allow");
  const [savingRule, setSavingRule] = useState(false);

  // Subtopic dialog state
  const [subtopicDialogOpen, setSubtopicDialogOpen] = useState(false);
  const [editingSubtopic, setEditingSubtopic] = useState<Subtopic | null>(null);
  const [subtopicName, setSubtopicName] = useState("");
  const [subtopicSlug, setSubtopicSlug] = useState("");
  const [subtopicWeight, setSubtopicWeight] = useState(1.0);

  const deriveSlug = (n: string) =>
    n
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-");

  const openSubtopicDialog = (subtopic?: Subtopic) => {
    if (subtopic) {
      setEditingSubtopic(subtopic);
      setSubtopicName(subtopic.name);
      setSubtopicSlug(subtopic.slug);
      setSubtopicWeight(subtopic.weight);
    } else {
      setEditingSubtopic(null);
      setSubtopicName("");
      setSubtopicSlug("");
      setSubtopicWeight(1.0);
    }
    setSubtopicDialogOpen(true);
  };

  const saveSubtopic = async () => {
    if (!subtopicName.trim() || !subtopicSlug.trim()) {
      setError("Name and slug are required");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const url = editingSubtopic
        ? `/api/themes/${theme.slug}/subtopics/${editingSubtopic.id}`
        : `/api/themes/${theme.slug}/subtopics`;
      
      const method = editingSubtopic ? "PATCH" : "POST";
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: subtopicName.trim(),
          slug: subtopicSlug.trim().toLowerCase(),
          weight: subtopicWeight,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed to save subtopic");
        return;
      }

      setSubtopicDialogOpen(false);
      router.refresh();
      // Reload subtopics
      const subtopicsRes = await fetch(`/api/themes/${theme.slug}/subtopics`);
      const subtopicsData = await subtopicsRes.json();
      setSubtopics(subtopicsData);
    } catch {
      setError("Failed to save subtopic");
    } finally {
      setSaving(false);
    }
  };

  const deleteSubtopic = async (id: string) => {
    if (!confirm("Are you sure you want to delete this subtopic?")) return;

    setError(null);
    try {
      const res = await fetch(`/api/themes/${theme.slug}/subtopics/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed to delete subtopic");
        return;
      }

      router.refresh();
      // Reload subtopics
      const subtopicsRes = await fetch(`/api/themes/${theme.slug}/subtopics`);
      const subtopicsData = await subtopicsRes.json();
      setSubtopics(subtopicsData);
    } catch {
      setError("Failed to delete subtopic");
    }
  };

  const addDomainRule = async () => {
    if (!newDomain.trim()) return;
    setSavingRule(true);
    try {
      const res = await fetch(`/api/themes/${theme.slug}/domain-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: newDomain.trim(), rule: newDomainRule }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error ? JSON.stringify(d.error) : "Failed to add domain rule");
        return;
      }
      const created = await res.json();
      setRules((prev) => {
        const existing = prev.findIndex((r) => r.domain === created.domain);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = created;
          return updated;
        }
        return [...prev, created];
      });
      setNewDomain("");
      toast.success(`Domain "${created.domain}" added as ${created.rule}`);
    } catch {
      toast.error("Failed to add domain rule");
    } finally {
      setSavingRule(false);
    }
  };

  const removeDomainRule = async (ruleId: string) => {
    try {
      const res = await fetch(`/api/themes/${theme.slug}/domain-rules?id=${ruleId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Failed to remove domain rule");
        return;
      }
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
      toast.success("Domain rule removed");
    } catch {
      toast.error("Failed to remove domain rule");
    }
  };

  const saveConfig = async () => {
    setError(null);
    setSaving(true);
    try {
      let parsedGdeltParams: Record<string, unknown> | null = null;
      if (gdeltParams.trim()) {
        try {
          parsedGdeltParams = JSON.parse(gdeltParams);
        } catch (e) {
          setError("Invalid JSON in GDELT Query Parameters");
          setSaving(false);
          return;
        }
      }

      const res = await fetch(`/api/themes/${theme.slug}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetLanguages: selectedLanguages,
          targetRegions: selectedRegions,
          dailyExtractionBudget: budget,
          hourlyRateLimit: hourlyLimit || null,
          maxArticleAge: maxArticleAge || null,
          minTextLengthThreshold: minLen,
          minQualityScore: minQuality,
          scheduleCron: cron || null,
          maxRefutedClaimsBeforeHold: maxRefuted,
          gdeltQueryParams: parsedGdeltParams,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ? JSON.stringify(d.error) : "Failed to save");
        return;
      }
      router.refresh();
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const saveDelivery = async () => {
    if (!deliveryUrl || !deliverySecret) {
      setError("URL and secret required");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/themes/${theme.slug}/delivery`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: deliveryUrl, secret: deliverySecret }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ? JSON.stringify(d.error) : "Failed to save");
        return;
      }
      setDeliverySecret("");
      router.refresh();
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Subtopics Management */}
      <Card>
        <CardHeader>
          <CardTitle>Subtopics</CardTitle>
          <CardDescription>
            Define specific topics to extract. These will be used to build GDELT queries.
          </CardDescription>
          <CardAction>
            <Dialog open={subtopicDialogOpen} onOpenChange={setSubtopicDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => openSubtopicDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Subtopic
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingSubtopic ? "Edit Subtopic" : "Add Subtopic"}
                  </DialogTitle>
                  <DialogDescription>
                    Configure a subtopic with name, slug, and weight (priority).
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="subtopic-name">Name</Label>
                    <Input
                      id="subtopic-name"
                      value={subtopicName}
                      onChange={(e) => {
                        setSubtopicName(e.target.value);
                        if (!editingSubtopic) {
                          setSubtopicSlug(deriveSlug(e.target.value));
                        }
                      }}
                      placeholder="e.g., Federal Reserve Rates"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subtopic-slug">Slug</Label>
                    <Input
                      id="subtopic-slug"
                      value={subtopicSlug}
                      onChange={(e) => setSubtopicSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      placeholder="federal-reserve-rates"
                      pattern="[a-z0-9-]+"
                    />
                    <p className="text-xs text-muted-foreground">
                      Only lowercase letters, numbers, and hyphens
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subtopic-weight">Weight (Priority)</Label>
                    <Input
                      id="subtopic-weight"
                      type="number"
                      step={0.1}
                      min={0}
                      max={10}
                      value={subtopicWeight}
                      onChange={(e) => setSubtopicWeight(parseFloat(e.target.value) || 1.0)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Higher weight = higher priority (0-10)
                    </p>
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setSubtopicDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={saveSubtopic} disabled={saving}>
                    {saving ? "Saving..." : editingSubtopic ? "Update" : "Create"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardAction>
        </CardHeader>
        <CardContent>
          {subtopics.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground mb-4">
                No subtopics configured. Add subtopics to define what to extract.
              </p>
              <Button variant="outline" onClick={() => openSubtopicDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Add First Subtopic
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subtopics.map((st) => (
                  <TableRow key={st.id}>
                    <TableCell className="font-medium">{st.name}</TableCell>
                    <TableCell className="font-mono text-xs">{st.slug}</TableCell>
                    <TableCell className="text-right">{st.weight.toFixed(1)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openSubtopicDialog(st)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteSubtopic(st.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Basic Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Configuration</CardTitle>
          <CardDescription>
            Theme scraping and quality settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Languages</Label>
              <Popover open={langPopoverOpen} onOpenChange={setLangPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      "w-full justify-between min-h-10 h-auto",
                      !selectedLanguages.length && "text-muted-foreground"
                    )}
                  >
                    <div className="flex flex-wrap gap-1 flex-1">
                      {selectedLanguages.length === 0 ? (
                        <span>Select languages...</span>
                      ) : (
                        selectedLanguages.map((langCode) => {
                          const lang = GDELT_LANGUAGES.find((l) => l.code === langCode);
                          return (
                            <Badge
                              variant="secondary"
                              key={langCode}
                              className="mr-1 mb-1 cursor-pointer"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedLanguages(
                                  selectedLanguages.filter((l) => l !== langCode)
                                );
                              }}
                            >
                              {lang?.name || langCode}
                              <span
                                className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 inline-flex items-center"
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setSelectedLanguages(
                                      selectedLanguages.filter((l) => l !== langCode)
                                    );
                                  }
                                }}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setSelectedLanguages(
                                    selectedLanguages.filter((l) => l !== langCode)
                                  );
                                }}
                              >
                                <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                              </span>
                            </Badge>
                          );
                        })
                      )}
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search languages..." />
                    <CommandList>
                      <CommandEmpty>No language found.</CommandEmpty>
                      <CommandGroup>
                        {GDELT_LANGUAGES.map((lang) => (
                          <CommandItem
                            key={lang.code}
                            value={`${lang.code} ${lang.name}`}
                            onSelect={() => {
                              if (selectedLanguages.includes(lang.code)) {
                                setSelectedLanguages(
                                  selectedLanguages.filter((l) => l !== lang.code)
                                );
                              } else {
                                setSelectedLanguages([...selectedLanguages, lang.code]);
                              }
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedLanguages.includes(lang.code)
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            <span>{lang.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({lang.code})
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                GDELT accepted languages (3-character codes)
              </p>
            </div>
            <div className="space-y-2">
              <Label>Regions</Label>
              <Popover open={regionPopoverOpen} onOpenChange={setRegionPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      "w-full justify-between min-h-10 h-auto",
                      !selectedRegions.length && "text-muted-foreground"
                    )}
                  >
                    <div className="flex flex-wrap gap-1 flex-1">
                      {selectedRegions.length === 0 ? (
                        <span>Select regions...</span>
                      ) : (
                        selectedRegions.map((regionCode) => {
                          const region = GDELT_COUNTRIES.find((r) => r.code === regionCode);
                          return (
                            <Badge
                              variant="secondary"
                              key={regionCode}
                              className="mr-1 mb-1 cursor-pointer"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedRegions(
                                  selectedRegions.filter((r) => r !== regionCode)
                                );
                              }}
                            >
                              {region?.name || regionCode}
                              <span
                                className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 inline-flex items-center"
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setSelectedRegions(
                                      selectedRegions.filter((r) => r !== regionCode)
                                    );
                                  }
                                }}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setSelectedRegions(
                                    selectedRegions.filter((r) => r !== regionCode)
                                  );
                                }}
                              >
                                <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                              </span>
                            </Badge>
                          );
                        })
                      )}
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search countries..." />
                    <CommandList>
                      <CommandEmpty>No country found.</CommandEmpty>
                      <CommandGroup>
                        {GDELT_COUNTRIES.map((country) => (
                          <CommandItem
                            key={country.code}
                            value={`${country.code} ${country.name}`}
                            onSelect={() => {
                              if (selectedRegions.includes(country.code)) {
                                setSelectedRegions(
                                  selectedRegions.filter((r) => r !== country.code)
                                );
                              } else {
                                setSelectedRegions([...selectedRegions, country.code]);
                              }
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedRegions.includes(country.code)
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            <span>{country.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({country.code})
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                GDELT accepted countries (2-character FIPS codes)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget">Daily extraction budget (headlines per day)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="budget"
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(parseInt(e.target.value, 10) || 0)}
                  min={1}
                  max={250}
                  className="w-24 shrink-0"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={resettingBudget}
                  onClick={async () => {
                    setResettingBudget(true);
                    try {
                      const res = await fetch(`/api/themes/${theme.slug}/budget/reset`, {
                        method: "POST",
                      });
                      if (!res.ok) {
                        const d = await res.json();
                        toast.error(d.error ?? "Failed to reset budget");
                        return;
                      }
                      toast.success("Daily extraction budget reset");
                      router.refresh();
                    } catch {
                      toast.error("Failed to reset budget");
                    } finally {
                      setResettingBudget(false);
                    }
                  }}
                >
                  <RotateCcw className={cn("size-4", resettingBudget && "animate-spin")} />
                  Reset
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Maximum number of headlines to fetch from GDELT per day (max 250 per request)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hourly-limit">Hourly rate limit (optional)</Label>
              <Input
                id="hourly-limit"
                type="number"
                value={hourlyLimit ?? ""}
                onChange={(e) =>
                  setHourlyLimit(e.target.value ? parseInt(e.target.value, 10) : null)
                }
                placeholder="Leave empty for no limit"
                min={0}
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of requests per hour (rate limiting)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-article-age">Período máximo de busca</Label>
              <Select value={maxArticleAge || "none"} onValueChange={(v) => setMaxArticleAge(v === "none" ? "" : v)}>
                <SelectTrigger id="max-article-age" className="w-full">
                  <SelectValue placeholder="Sem limite (últimos 3 meses)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem limite (últimos 3 meses)</SelectItem>
                  <SelectItem value="24h">Últimas 24 horas</SelectItem>
                  <SelectItem value="48h">Últimas 48 horas</SelectItem>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="14d">Últimos 14 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Limite o período de busca de artigos no GDELT. Deixe vazio para buscar nos últimos 3 meses (padrão).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="min-len">Min text length</Label>
              <Input
                id="min-len"
                type="number"
                value={minLen}
                onChange={(e) => setMinLen(parseInt(e.target.value, 10) || 0)}
                min={0}
              />
              <p className="text-xs text-muted-foreground">
                Minimum characters required in extracted text
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="min-quality">Min quality score</Label>
              <Input
                id="min-quality"
                type="number"
                step={0.1}
                min={0}
                max={1}
                value={minQuality}
                onChange={(e) =>
                  setMinQuality(parseFloat(e.target.value) || 0)
                }
              />
              <p className="text-xs text-muted-foreground">
                Quality threshold (0.0 - 1.0)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-refuted">Max refuted claims before hold</Label>
              <Input
                id="max-refuted"
                type="number"
                value={maxRefuted}
                onChange={(e) =>
                  setMaxRefuted(parseInt(e.target.value, 10) || 0)
                }
                min={0}
              />
              <p className="text-xs text-muted-foreground">
                Hold delivery if more claims are refuted
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cron">Schedule (cron expression)</Label>
              <Input
                id="cron"
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                placeholder="0 */6 * * * (every 6 hours)"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty for manual triggers only
              </p>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter className="border-t">
          <Button onClick={saveConfig} disabled={saving} className="ml-auto">
            {saving ? "Saving..." : "Save config"}
          </Button>
        </CardFooter>
      </Card>

      {/* GDELT Query Preview */}
      <Card>
        <CardHeader>
          <CardTitle>GDELT Query</CardTitle>
          <CardDescription>
            The search query is built automatically from your subtopics. The keywords
            below are sent to GDELT as-is. Edit subtopics above to change what is searched.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Auto-generated query (from subtopics)</Label>
            <div className="rounded-md border bg-muted/50 p-3 font-mono text-sm whitespace-pre-wrap break-all">
              {derivedGdeltQuery}
            </div>
            <p className="text-xs text-muted-foreground">
              This query is rebuilt every time you add, edit, or remove subtopics.
              Language/region filters are appended automatically at search time.
            </p>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="gdelt-params">Advanced overrides (JSON, optional)</Label>
            <Textarea
              id="gdelt-params"
              value={gdeltParams}
              onChange={(e) => setGdeltParams(e.target.value)}
              placeholder={`{
  "timespan": "24h",
  "maxrecords": 100
}`}
              className="font-mono text-sm min-h-[120px]"
            />
            <p className="text-xs text-muted-foreground">
              Override timespan, maxrecords, etc. The &quot;query&quot; field here is ignored
              — keywords always come from subtopics. See{" "}
              <a
                href="https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                GDELT DOC 2.0 API docs
              </a>
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter className="border-t">
          <Button onClick={saveConfig} disabled={saving} className="ml-auto">
            {saving ? "Saving..." : "Save config"}
          </Button>
        </CardFooter>
      </Card>

      {/* Delivery Endpoint */}
      <Card>
        <CardHeader>
          <CardTitle>Delivery Endpoint</CardTitle>
          <CardDescription>
            Orchestrator URL and HMAC secret for secure delivery
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="delivery-url">URL</Label>
            <Input
              id="delivery-url"
              value={deliveryUrl}
              onChange={(e) => setDeliveryUrl(e.target.value)}
              placeholder="https://orchestrator.example.com/ingest/market"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="delivery-secret">Secret (for HMAC signing)</Label>
            <Input
              id="delivery-secret"
              type="password"
              value={deliverySecret}
              onChange={(e) => setDeliverySecret(e.target.value)}
              placeholder="••••••••••••"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter className="border-t">
          <Button onClick={saveDelivery} disabled={saving} className="ml-auto">
            {saving ? "Saving..." : "Save delivery"}
          </Button>
        </CardFooter>
      </Card>

      {/* Domain Rules */}
      <Card>
        <CardHeader>
          <CardTitle>Domain Rules</CardTitle>
          <CardDescription>
            Control which news sources are used. When &quot;allow&quot; rules exist, only
            those domains are fetched. &quot;Block&quot; rules exclude specific domains.
            Leave empty to allow all domains.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="new-domain">Domain</Label>
              <Input
                id="new-domain"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="e.g. reuters.com"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addDomainRule();
                  }
                }}
              />
            </div>
            <div className="w-28 space-y-1">
              <Label htmlFor="new-domain-rule">Rule</Label>
              <Select value={newDomainRule} onValueChange={(v) => setNewDomainRule(v as "allow" | "block")}>
                <SelectTrigger id="new-domain-rule">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">Allow</SelectItem>
                  <SelectItem value="block">Block</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addDomainRule} disabled={savingRule || !newDomain.trim()} size="sm">
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No domain rules configured — all domains are allowed.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">{r.domain}</TableCell>
                    <TableCell>
                      <Badge variant={r.rule === "allow" ? "default" : "destructive"}>
                        {r.rule}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDomainRule(r.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
