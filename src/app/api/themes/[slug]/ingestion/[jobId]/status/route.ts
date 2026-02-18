import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; jobId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug, jobId } = await params;
  
  const theme = await prisma.theme.findUnique({
    where: { slug },
  });
  
  if (!theme) {
    return NextResponse.json({ error: "Theme not found" }, { status: 404 });
  }

  const ingestionJob = await prisma.ingestionJob.findUnique({
    where: { id: jobId },
    include: {
      scrapeJobs: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (!ingestionJob || ingestionJob.themeId !== theme.id) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const totalJobs = ingestionJob.scrapeJobs.length;
  const completedJobs = ingestionJob.scrapeJobs.filter(
    (job) => job.status === "extracted" || job.status === "skipped"
  ).length;
  const failedJobs = ingestionJob.scrapeJobs.filter(
    (job) => job.status === "failed"
  ).length;
  const scrapingJobs = ingestionJob.scrapeJobs.filter(
    (job) => job.status === "scraping"
  ).length;
  const pendingJobs = ingestionJob.scrapeJobs.filter(
    (job) => job.status === "pending"
  ).length;
  
  // Calculate progress including jobs that are done (extracted, skipped, failed)
  const doneJobs = completedJobs + failedJobs;
  // Show minimal progress (5%) when jobs are being processed, even if none completed yet
  let progress = 0;
  if (totalJobs > 0) {
    progress = (doneJobs / totalJobs) * 100;
    // If there are jobs being scraped but none completed, show at least 5% progress
    if (scrapingJobs > 0 && doneJobs === 0) {
      progress = 5;
    }
    // If there are pending jobs being prepared, show minimal progress
    else if (pendingJobs > 0 && scrapingJobs === 0 && doneJobs === 0) {
      progress = 2;
    }
  }

  // Get current status message based on job state
  let statusMessage = "Aguardando início...";
  if (ingestionJob.status === "pending") {
    statusMessage = "Preparando extração...";
  } else if (ingestionJob.status === "running") {
    if (totalJobs === 0) {
      statusMessage = "Consultando GDELT e preparando URLs...";
    } else if (pendingJobs > 0 && scrapingJobs === 0 && completedJobs === 0) {
      statusMessage = `Preparando ${pendingJobs} URL(s) para extração...`;
    } else if (scrapingJobs > 0) {
      const inProgress = scrapingJobs + pendingJobs;
      statusMessage = `Extraindo ${scrapingJobs} artigo(s)... ${completedJobs} de ${totalJobs} concluído(s)`;
    } else if (completedJobs > 0 && completedJobs < totalJobs) {
      statusMessage = `Processando: ${completedJobs} de ${totalJobs} concluído(s)`;
    } else if (completedJobs === totalJobs && doneJobs === totalJobs) {
      statusMessage = "Finalizando processamento...";
    } else {
      statusMessage = `Processando extrações: ${completedJobs} de ${totalJobs} concluída(s)`;
    }
  } else if (ingestionJob.status === "completed") {
    statusMessage = `Extração concluída: ${completedJobs} documento(s) extraído(s)`;
    if (failedJobs > 0) {
      statusMessage += `, ${failedJobs} falha(s)`;
    }
  } else if (ingestionJob.status === "failed") {
    statusMessage = `Extração falhou: ${failedJobs} erro(s)`;
  }

  return NextResponse.json({
    jobId: ingestionJob.id,
    status: ingestionJob.status,
    progress: Math.min(100, Math.max(0, progress)), // Ensure progress is between 0 and 100
    totalJobs,
    completedJobs,
    failedJobs,
    scrapingJobs,
    pendingJobs,
    statusMessage,
    createdAt: ingestionJob.createdAt,
    completedAt: ingestionJob.completedAt,
  });
}
