import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import crypto from "crypto";

const deliverySchema = z.object({
  url: z.string().url(),
  secret: z.string().min(1),
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
    include: { delivery: true },
  });
  if (!theme) {
    return NextResponse.json({ error: "Theme not found" }, { status: 404 });
  }

  const delivery = theme.delivery;
  if (!delivery) {
    return NextResponse.json({ url: null, configured: false });
  }

  return NextResponse.json({
    url: delivery.url,
    configured: true,
    id: delivery.id,
  });
}

export async function PUT(
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
    include: { delivery: true },
  });
  if (!theme) {
    return NextResponse.json({ error: "Theme not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const parsed = deliverySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const secretHash = crypto
      .createHash("sha256")
      .update(parsed.data.secret)
      .digest("hex");

    const delivery = await prisma.themeDeliveryEndpoint.upsert({
      where: { themeId: theme.id },
      create: {
        themeId: theme.id,
        url: parsed.data.url,
        secretHash,
      },
      update: {
        url: parsed.data.url,
        secretHash,
      },
    });

    return NextResponse.json({
      url: delivery.url,
      configured: true,
      message: "Delivery endpoint saved. Secret is stored hashed.",
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to save delivery endpoint" },
      { status: 500 }
    );
  }
}
