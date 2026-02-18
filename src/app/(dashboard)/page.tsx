import Link from "next/link";
import { prisma } from "@/lib/prisma";
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

async function getThemesWithUsage() {
  const themes = await prisma.theme.findMany({
    include: {
      configs: {
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const budgetUsage = await prisma.dailyBudgetUsage.findMany({
    where: { date: today },
  });
  const usageMap = Object.fromEntries(
    budgetUsage.map((u) => [u.themeId, { used: u.used, limit: u.limit }])
  );
  return themes.map((t) => ({
    ...t,
    budget: t.configs[0]
      ? usageMap[t.id] ?? { used: 0, limit: t.configs[0].dailyExtractionBudget }
      : { used: 0, limit: 0 },
  }));
}

export default async function DashboardPage() {
  const themes = await getThemesWithUsage();

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Themes</h1>
          <p className="text-muted-foreground">
            Manage your scraping themes and configurations
          </p>
        </div>
        <Button asChild>
          <Link href="/themes/new">+ New Theme</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Themes</CardTitle>
          <CardDescription>
            Configured scraping themes and their status
          </CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" asChild>
              <Link href="/themes/new">Create</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {themes.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground mb-4">
                No themes yet. Create one to get started.
              </p>
              <Button asChild>
                <Link href="/themes/new">Create your first theme</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
              <TableCaption>
                A list of all your scraping themes and their daily usage.
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Theme</TableHead>
                  <TableHead>Extractions today</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {themes.map((theme) => (
                  <TableRow key={theme.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/themes/${theme.slug}`}
                        className="hover:underline"
                      >
                        {theme.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{theme.budget.used}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        / {theme.budget.limit}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">Active</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/themes/${theme.slug}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
