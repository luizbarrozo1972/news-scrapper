import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
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

  const doc = await prisma.extractedDocument.findFirst({
    where: {
      id,
      themeId: theme.id,
    },
    include: {
      scrapeJob: {
        include: { attempts: true },
      },
      newsItem: {
        include: {
          claims: {
            include: { evidences: true },
          },
        },
      },
    },
  });

  if (!doc) {
    return NextResponse.json({ error: "Extraction not found" }, { status: 404 });
  }

  const deliveryLogs = await prisma.deliveryLog.findMany({
    where: { themeId: theme.id, newsItemId: doc.newsItem?.id },
  });

  return NextResponse.json({
    ...doc,
    deliveryLogs,
  });
}
