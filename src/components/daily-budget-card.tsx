"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface DailyBudgetCardProps {
  slug: string;
  used: number;
  limit: number;
  budgetPercent: number;
}

export function DailyBudgetCard({
  slug,
  used,
  limit,
  budgetPercent,
}: DailyBudgetCardProps) {
  const router = useRouter();
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await fetch(`/api/themes/${slug}/budget/reset`, {
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
      setResetting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>Daily Budget</CardTitle>
          <CardDescription>
            {used} / {limit} extractions used today
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          disabled={resetting || used === 0}
          className="shrink-0"
        >
          <RotateCcw
            className={`size-4 ${resetting ? "animate-spin" : ""}`}
          />
          Reset
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Progress value={budgetPercent} />
          <p className="text-xs text-muted-foreground">
            {Math.round(budgetPercent)}% of daily limit used
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
