"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Sparkles, FileText, BarChart3 } from "lucide-react";
import { useExtractionProgress } from "@/contexts/extraction-progress-context";
import { Progress } from "@/components/ui/progress";

export function ThemeTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const { progress } = useExtractionProgress();
  
  const getActiveTab = () => {
    if (pathname === `/themes/${slug}`) return "settings";
    if (pathname.includes("/configure")) return "configure";
    if (pathname.includes("/extractions")) return "extractions";
    if (pathname.includes("/dashboard")) return "dashboard";
    return "settings";
  };

  return (
    <div className="w-full space-y-3">
      <Tabs value={getActiveTab()} className="w-full">
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="settings" asChild>
            <Link href={`/themes/${slug}`}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Link>
          </TabsTrigger>
          <TabsTrigger value="configure" asChild>
            <Link href={`/themes/${slug}/configure`}>
              <Sparkles className="mr-2 h-4 w-4" />
              Configure with AI
            </Link>
          </TabsTrigger>
          <TabsTrigger value="extractions" asChild>
            <Link href={`/themes/${slug}/extractions`}>
              <FileText className="mr-2 h-4 w-4" />
              Extractions
            </Link>
          </TabsTrigger>
          <TabsTrigger value="dashboard" asChild>
            <Link href={`/themes/${slug}/dashboard`}>
              <BarChart3 className="mr-2 h-4 w-4" />
              Dashboard
            </Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {progress.isActive && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground font-medium">{progress.statusMessage || "Processando..."}</span>
            {progress.totalJobs > 0 && (
              <span className="text-muted-foreground font-mono text-xs">
                {progress.completedJobs + progress.failedJobs} / {progress.totalJobs}
              </span>
            )}
          </div>
          <Progress 
            value={Math.max(0, Math.min(100, progress.progress || 0))} 
            className="h-2" 
          />
        </div>
      )}
    </div>
  );
}
