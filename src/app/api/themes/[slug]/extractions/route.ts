import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
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

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const status = searchParams.get("status");
  const domain = searchParams.get("domain");
  const method = searchParams.get("method");
  const minQuality = searchParams.get("minQuality");
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "25", 10), 100);
  const offset = (page - 1) * limit;

  const where: Record<string, unknown> = { themeId: theme.id };

  if (dateFrom || dateTo) {
    where.scrapedAt = {};
    if (dateFrom) {
      (where.scrapedAt as Record<string, Date>).gte = new Date(dateFrom);
    }
    if (dateTo) {
      (where.scrapedAt as Record<string, Date>).lte = new Date(dateTo);
    }
  }
  if (domain) {
    where.sourceDomain = { contains: domain, mode: "insensitive" };
  }
  if (method) {
    where.extractionMethod = method;
  }
  if (minQuality) {
    where.qualityScore = { gte: parseFloat(minQuality) };
  }
  if (status) {
    const docWhere = where;
    if (status === "delivered") {
      (docWhere as Record<string, unknown>).newsItem = {
        deliveryStatus: "sent",
      };
    } else if (status === "held") {
      (docWhere as Record<string, unknown>).newsItem = {
        deliveryStatus: "held",
      };
    } else if (status === "failed") {
      (docWhere as Record<string, unknown>).newsItem = {
        deliveryStatus: "failed",
      };
    }
  }

  const [docs, total] = await Promise.all([
    prisma.extractedDocument.findMany({
      where,
      include: {
        newsItem: {
          select: {
            id: true,
            deliveryStatus: true,
            deliveredAt: true,
            summaryEditorial: true,
          },
        },
      },
      orderBy: { scrapedAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.extractedDocument.count({ where }),
  ]);

  return NextResponse.json({
    items: docs,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

export async function DELETE(
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

  const body = await request.json();
  const { ids } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json(
      { error: "ids must be a non-empty array" },
      { status: 400 }
    );
  }

  // Verify all IDs belong to this theme
  const existingDocs = await prisma.extractedDocument.findMany({
    where: {
      id: { in: ids },
      themeId: theme.id,
    },
    select: { id: true },
  });

  if (existingDocs.length !== ids.length) {
    return NextResponse.json(
      { error: "Some extractions not found or don't belong to this theme" },
      { status: 400 }
    );
  }

  // Delete the extractions (cascade will handle related records)
  await prisma.extractedDocument.deleteMany({
    where: {
      id: { in: ids },
      themeId: theme.id,
    },
  });

  return NextResponse.json({
    success: true,
    deleted: existingDocs.length,
  });
}
