import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const domainRuleSchema = z.object({
  domain: z.string().min(1).transform((d) => d.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")),
  rule: z.enum(["allow", "block"]),
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
  const theme = await prisma.theme.findUnique({ where: { slug } });
  if (!theme) {
    return NextResponse.json({ error: "Theme not found" }, { status: 404 });
  }

  const rules = await prisma.domainRule.findMany({
    where: { themeId: theme.id },
    orderBy: { domain: "asc" },
  });

  return NextResponse.json(rules);
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
  const theme = await prisma.theme.findUnique({ where: { slug } });
  if (!theme) {
    return NextResponse.json({ error: "Theme not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const parsed = domainRuleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const rule = await prisma.domainRule.upsert({
      where: {
        themeId_domain: {
          themeId: theme.id,
          domain: parsed.data.domain,
        },
      },
      update: { rule: parsed.data.rule },
      create: {
        themeId: theme.id,
        domain: parsed.data.domain,
        rule: parsed.data.rule,
      },
    });

    return NextResponse.json(rule);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to save domain rule" }, { status: 500 });
  }
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
  const theme = await prisma.theme.findUnique({ where: { slug } });
  if (!theme) {
    return NextResponse.json({ error: "Theme not found" }, { status: 404 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const ruleId = searchParams.get("id");
    if (!ruleId) {
      return NextResponse.json({ error: "Missing rule id" }, { status: 400 });
    }

    const existing = await prisma.domainRule.findFirst({
      where: { id: ruleId, themeId: theme.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    await prisma.domainRule.delete({ where: { id: ruleId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to delete domain rule" }, { status: 500 });
  }
}
