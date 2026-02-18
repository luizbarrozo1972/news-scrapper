import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const theme = await prisma.theme.findUnique({
    where: { slug },
  });
  if (!theme) {
    return NextResponse.json({ error: "Theme not found" }, { status: 404 });
  }

  const config = await prisma.themeConfig.findFirst({
    where: { themeId: theme.id },
    orderBy: { version: "desc" },
  });
  const limit = config?.dailyExtractionBudget ?? 500;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.dailyBudgetUsage.upsert({
    where: {
      themeId_date: { themeId: theme.id, date: today },
    },
    create: {
      themeId: theme.id,
      date: today,
      used: 0,
      limit,
    },
    update: { used: 0 },
  });

  return NextResponse.json({ ok: true });
}
