import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateThemeSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

export async function GET(
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
    include: {
      configs: { orderBy: { version: "desc" }, take: 1 },
      delivery: true,
      domainRules: true,
      subtopics: true,
    },
  });

  if (!theme) {
    return NextResponse.json({ error: "Theme not found" }, { status: 404 });
  }

  const { delivery, ...rest } = theme;
  return NextResponse.json({
    ...rest,
    delivery: delivery
      ? { url: delivery.url, id: delivery.id }
      : null,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  try {
    const body = await request.json();
    const parsed = updateThemeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const theme = await prisma.theme.update({
      where: { slug },
      data: parsed.data,
    });
    return NextResponse.json(theme);
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") {
      return NextResponse.json({ error: "Theme not found" }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json(
      { error: "Failed to update theme" },
      { status: 500 }
    );
  }
}
