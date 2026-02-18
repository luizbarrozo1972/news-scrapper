import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { rebuildGdeltQueryFromSubtopics } from "@/lib/gdelt-sync";

const subtopicSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  weight: z.number().min(0).max(10).default(1.0),
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
  });
  if (!theme) {
    return NextResponse.json({ error: "Theme not found" }, { status: 404 });
  }

  const subtopics = await prisma.subtopic.findMany({
    where: { themeId: theme.id },
    orderBy: { weight: "desc" },
  });

  return NextResponse.json(subtopics);
}

export async function POST(
  request: Request,
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

  try {
    const body = await request.json();
    const parsed = subtopicSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, slug: subtopicSlug, weight } = parsed.data;

    // Check if subtopic with this slug already exists
    const existing = await prisma.subtopic.findUnique({
      where: {
        themeId_slug: {
          themeId: theme.id,
          slug: subtopicSlug,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Subtopic with this slug already exists" },
        { status: 400 }
      );
    }

    const subtopic = await prisma.subtopic.create({
      data: {
        themeId: theme.id,
        name,
        slug: subtopicSlug,
        weight,
      },
    });

    await rebuildGdeltQueryFromSubtopics(theme.id);

    return NextResponse.json(subtopic);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to create subtopic" },
      { status: 500 }
    );
  }
}
