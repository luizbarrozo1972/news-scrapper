import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createThemeSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const themes = await prisma.theme.findMany({
    include: {
      configs: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  return NextResponse.json(themes);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    console.log("Received theme creation request:", body);
    const parsed = createThemeSchema.safeParse(body);
    if (!parsed.success) {
      console.error("Validation errors:", parsed.error.flatten().fieldErrors);
      return NextResponse.json(
        { 
          error: parsed.error.flatten().fieldErrors,
          message: "Validation failed. Check name and slug fields."
        },
        { status: 400 }
      );
    }
    const { name, slug, description } = parsed.data;

    const existing = await prisma.theme.findUnique({
      where: { slug },
    });
    if (existing) {
      return NextResponse.json(
        { error: { slug: ["Theme with this slug already exists"] } },
        { status: 400 }
      );
    }

    const theme = await prisma.theme.create({
      data: {
        name,
        slug,
        description: description ?? null,
      },
    });

    await prisma.themeConfig.create({
      data: {
        themeId: theme.id,
        version: 1,
        targetLanguages: ["en"],
        targetRegions: ["US"],
        dailyExtractionBudget: 500,
        createdBy: session.user.id,
      },
    });

    return NextResponse.json(theme);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to create theme" },
      { status: 500 }
    );
  }
}
