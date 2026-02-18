import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";

const configSchema = z.object({
  targetLanguages: z.array(z.string()).optional(),
  targetRegions: z.array(z.string()).optional(),
  minTextLengthThreshold: z.number().int().min(0).optional(),
  minQualityScore: z.number().min(0).max(1).optional(),
  dailyExtractionBudget: z.number().int().min(0).optional(),
  hourlyRateLimit: z.number().int().optional().nullable(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = configSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { valid: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    return NextResponse.json({ valid: true });
  } catch {
    return NextResponse.json(
      { valid: false, error: "Validation failed" },
      { status: 400 }
    );
  }
}
