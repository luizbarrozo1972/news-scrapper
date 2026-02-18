"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { CheckCircle2, Loader2, Check, ChevronsUpDown, X } from "lucide-react";
import { GDELT_LANGUAGES, GDELT_COUNTRIES } from "@/lib/gdelt-constants";
import { cn } from "@/lib/utils";

type GeneratedConfig = {
  config: {
    id: string;
    version: number;
    targetLanguages: string[];
    targetRegions: string[];
    dailyExtractionBudget: number;
    minTextLengthThreshold: number;
    minQualityScore: number;
    gdeltQueryParams?: Record<string, unknown>;
  };
  subtopics: Array<{ id: string; name: string; slug: string; weight: number }>;
  domainRules: Array<{ id: string; domain: string; rule: string }>;
  message: string;
};

export default function ConfigurePage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const [objectives, setObjectives] = useState("");
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [langPopoverOpen, setLangPopoverOpen] = useState(false);
  const [regionPopoverOpen, setRegionPopoverOpen] = useState(false);
  const [result, setResult] = useState<GeneratedConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const generate = async () => {
    setError(null);
    setResult(null);
    setApplied(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/themes/${slug}/config/from-objectives`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          objectives,
          targetLanguages: selectedLanguages.length > 0 ? selectedLanguages : undefined,
          targetRegions: selectedRegions.length > 0 ? selectedRegions : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ? JSON.stringify(data.error) : data.message || "Failed to generate");
        return;
      }
      setResult(data);
      // Auto-apply if successful
      setApplied(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate config");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">AI Config Assistant</h2>
        <p className="text-muted-foreground">
          Descreva em detalhes o que você quer rastrear. A IA configurará automaticamente subtopics, idiomas, regiões, domínios confiáveis e parâmetros do GDELT.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Objetivos</CardTitle>
          <CardDescription>
            Descreva em português ou inglês o que você quer extrair. Seja específico sobre temas, fontes confiáveis e volume desejado. Use os campos abaixo para especificar idiomas e regiões.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Language and Region Selection */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Idiomas (opcional)</Label>
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
                        <span>Selecione idiomas...</span>
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
                    <CommandInput placeholder="Buscar idiomas..." />
                    <CommandList>
                      <CommandEmpty>Nenhum idioma encontrado.</CommandEmpty>
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
                Idiomas aceitos pelo GDELT (códigos de 3 caracteres)
              </p>
            </div>
            <div className="space-y-2">
              <Label>Regiões (opcional)</Label>
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
                        <span>Selecione regiões...</span>
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
                    <CommandInput placeholder="Buscar regiões..." />
                    <CommandList>
                      <CommandEmpty>Nenhuma região encontrada.</CommandEmpty>
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
                Países aceitos pelo GDELT (códigos FIPS de 2 caracteres)
              </p>
            </div>
          </div>

          <Textarea
            value={objectives}
            onChange={(e) => setObjectives(e.target.value)}
            placeholder='Exemplo: "Rastrear notícias de mercado financeiro voltadas a investidores pessoa física. Cobrir ações, dividendos, resultados trimestrais, juros, inflação, câmbio, macroeconomia, empresas, IPOs, ETFs e grandes eventos corporativos. Meta de 200-500 itens por dia."'
            className="min-h-[200px] font-mono text-sm"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={generate} disabled={loading || !objectives.trim()} size="lg">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Gerando configuração...
              </>
            ) : (
              "Gerar Configuração Completa"
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <>
          {applied && (
            <Card className="border-green-500">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                  <p className="font-medium">
                    Configuração aplicada automaticamente! {result.message}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Configuração Gerada</CardTitle>
              <CardDescription>
                A configuração foi aplicada automaticamente. Revise os detalhes abaixo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Subtopics */}
              {result.subtopics && result.subtopics.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Subtopics Criados ({result.subtopics.length})</h3>
                  <div className="flex flex-wrap gap-2">
                    {result.subtopics.map((st) => (
                      <Badge key={st.id} variant="secondary">
                        {st.name} (peso: {st.weight.toFixed(1)})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Domain Rules */}
              {result.domainRules && result.domainRules.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Domínios Confiáveis ({result.domainRules.length})</h3>
                  <div className="flex flex-wrap gap-2">
                    {result.domainRules.map((dr) => (
                      <Badge key={dr.id} variant="default">
                        {dr.domain}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Config Summary */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="font-semibold mb-2">Idiomas</h3>
                  <div className="flex flex-wrap gap-2">
                    {result.config.targetLanguages.map((lang) => (
                      <Badge key={lang} variant="outline">{lang}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Regiões</h3>
                  <div className="flex flex-wrap gap-2">
                    {result.config.targetRegions.map((region) => (
                      <Badge key={region} variant="outline">{region}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Budget Diário</h3>
                  <p className="text-2xl font-bold">{result.config.dailyExtractionBudget}</p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Qualidade Mínima</h3>
                  <p className="text-2xl font-bold">{result.config.minQualityScore.toFixed(2)}</p>
                </div>
              </div>

              {/* GDELT Query Params */}
              {result.config.gdeltQueryParams && (
                <div>
                  <h3 className="font-semibold mb-2">Parâmetros GDELT</h3>
                  <pre className="rounded bg-muted p-4 text-xs overflow-auto max-h-[300px]">
                    {JSON.stringify(result.config.gdeltQueryParams, null, 2)}
                  </pre>
                </div>
              )}

              {/* Full Config JSON */}
              <details className="mt-4">
                <summary className="cursor-pointer font-medium text-sm text-muted-foreground hover:text-foreground">
                  Ver JSON completo
                </summary>
                <pre className="mt-2 rounded bg-muted p-4 text-xs overflow-auto max-h-[400px]">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>

              <div className="flex gap-2 pt-4 border-t">
                <Button
                  onClick={() => router.push(`/themes/${slug}`)}
                  variant="outline"
                >
                  Ver Configuração Completa
                </Button>
                <Button
                  onClick={() => router.push(`/themes/${slug}/extractions`)}
                >
                  Ver Extrações
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
