"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

interface ExtractionProgress {
  jobId: string | null;
  status: string;
  progress: number;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  scrapingJobs: number;
  pendingJobs: number;
  statusMessage: string;
  isActive: boolean;
}

interface ExtractionProgressContextType {
  progress: ExtractionProgress;
  startExtraction: (slug: string, jobId: string) => void;
  stopExtraction: () => void;
}

const ExtractionProgressContext = createContext<ExtractionProgressContextType | undefined>(
  undefined
);

export function ExtractionProgressProvider({ children }: { children: React.ReactNode }) {
  const [progress, setProgress] = useState<ExtractionProgress>({
    jobId: null,
    status: "idle",
    progress: 0,
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    scrapingJobs: 0,
    pendingJobs: 0,
    statusMessage: "",
    isActive: false,
  });

  const [currentSlug, setCurrentSlug] = useState<string | null>(null);

  const fetchProgress = useCallback(async (slug: string, jobId: string) => {
    try {
      const res = await fetch(`/api/themes/${slug}/ingestion/${jobId}/status`);
      if (!res.ok) {
        throw new Error("Failed to fetch progress");
      }
      const data = await res.json();
      
      const isJobActive = data.status === "running" || data.status === "pending";
      
      setProgress({
        jobId: data.jobId,
        status: data.status,
        progress: data.progress ?? 0,
        totalJobs: data.totalJobs ?? 0,
        completedJobs: data.completedJobs ?? 0,
        failedJobs: data.failedJobs ?? 0,
        scrapingJobs: data.scrapingJobs ?? 0,
        pendingJobs: data.pendingJobs ?? 0,
        statusMessage: data.statusMessage ?? "",
        isActive: isJobActive || data.status === "completed" || data.status === "failed",
      });

      // If job is completed or failed, stop polling but keep showing for a few seconds
      if (data.status === "completed" || data.status === "failed") {
        // Keep showing progress for 5 seconds before hiding
        setTimeout(() => {
          setProgress((prev) => {
            // Only hide if it's still the same job
            if (prev.jobId === data.jobId) {
              return {
                ...prev,
                isActive: false,
                jobId: null,
              };
            }
            return prev;
          });
          setCurrentSlug((prevSlug) => prevSlug === slug ? null : prevSlug);
        }, 5000);
      }
    } catch (error) {
      console.error("Error fetching extraction progress:", error);
    }
  }, []);

  useEffect(() => {
    if (!progress.jobId || !currentSlug) {
      return;
    }

    // Don't poll if job is completed or failed (but still showing)
    if (progress.status === "completed" || progress.status === "failed") {
      return;
    }

    // Poll every 1.5 seconds for more responsive updates
    const interval = setInterval(() => {
      if (progress.jobId && currentSlug) {
        fetchProgress(currentSlug, progress.jobId);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [progress.jobId, currentSlug, progress.status, fetchProgress]);

  const startExtraction = useCallback((slug: string, jobId: string) => {
    setCurrentSlug(slug);
    setProgress({
      jobId,
      status: "pending",
      progress: 0,
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      scrapingJobs: 0,
      pendingJobs: 0,
      statusMessage: "Iniciando extração...",
      isActive: true,
    });
    // Fetch immediately
    fetchProgress(slug, jobId);
  }, [fetchProgress]);

  const stopExtraction = useCallback(() => {
    setProgress({
      jobId: null,
      status: "idle",
      progress: 0,
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      scrapingJobs: 0,
      pendingJobs: 0,
      statusMessage: "",
      isActive: false,
    });
    setCurrentSlug(null);
  }, []);

  return (
    <ExtractionProgressContext.Provider
      value={{ progress, startExtraction, stopExtraction }}
    >
      {children}
    </ExtractionProgressContext.Provider>
  );
}

export function useExtractionProgress() {
  const context = useContext(ExtractionProgressContext);
  if (context === undefined) {
    throw new Error(
      "useExtractionProgress must be used within an ExtractionProgressProvider"
    );
  }
  return context;
}
