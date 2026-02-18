import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { rebuildGdeltQueryFromSubtopics } from "@/lib/gdelt-sync";

const updateSubtopicSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  weight: z.number().min(0).max(10).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug, id } = await params;
  const theme = await prisma.theme.findUnique({
    where: { slug },
  });
  if (!theme) {
    return NextResponse.json({ error: "Theme not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const parsed = updateSubtopicSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const subtopic = await prisma.subtopic.findFirst({
      where: { id, themeId: theme.id },
    });

    if (!subtopic) {
      return NextResponse.json({ error: "Subtopic not found" }, { status: 404 });
    }

    // Check slug uniqueness if updating slug
    if (parsed.data.slug && parsed.data.slug !== subtopic.slug) {
      const existing = await prisma.subtopic.findUnique({
        where: {
          themeId_slug: {
            themeId: theme.id,
            slug: parsed.data.slug,
          },
        },
      });

      if (existing) {
        return NextResponse.json(
          { error: "Subtopic with this slug already exists" },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.subtopic.update({
      where: { id },
      data: parsed.data,
    });

    await rebuildGdeltQueryFromSubtopics(theme.id);

    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to update subtopic" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug, id } = await params;
  const theme = await prisma.theme.findUnique({
    where: { slug },
  });
  if (!theme) {
    return NextResponse.json({ error: "Theme not found" }, { status: 404 });
  }

  try {
    const subtopic = await prisma.subtopic.findFirst({
      where: { id, themeId: theme.id },
    });

    if (!subtopic) {
      return NextResponse.json({ error: "Subtopic not found" }, { status: 404 });
    }

    await prisma.subtopic.delete({
      where: { id },
    });

    await rebuildGdeltQueryFromSubtopics(theme.id);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to delete subtopic" },
      { status: 500 }
    );
  }
}
