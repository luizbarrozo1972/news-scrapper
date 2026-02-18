-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "emailVerified" TIMESTAMP(3),
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Theme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Theme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subtopic" (
    "id" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "Subtopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThemeConfig" (
    "id" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "targetLanguages" TEXT[],
    "targetRegions" TEXT[],
    "minTextLengthThreshold" INTEGER NOT NULL DEFAULT 500,
    "minQualityScore" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "qualityFlagsHandling" JSONB,
    "maxRefutedClaimsBeforeHold" INTEGER,
    "scheduleCron" TEXT,
    "dailyExtractionBudget" INTEGER NOT NULL DEFAULT 500,
    "hourlyRateLimit" INTEGER,
    "gdeltQueryParams" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "changeReason" TEXT,

    CONSTRAINT "ThemeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigChangeLog" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "diff" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThemeDeliveryEndpoint" (
    "id" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "hmacAlg" TEXT NOT NULL DEFAULT 'sha256',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThemeDeliveryEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainRule" (
    "id" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "rule" TEXT NOT NULL,

    CONSTRAINT "DomainRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionJob" (
    "id" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "configVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "IngestionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapeJob" (
    "id" TEXT NOT NULL,
    "ingestionJobId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "canonicalUrl" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ScrapeJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionAttempt" (
    "id" TEXT NOT NULL,
    "scrapeJobId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "durationMs" INTEGER,
    "cleanTextLength" INTEGER,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractedDocument" (
    "id" TEXT NOT NULL,
    "scrapeJobId" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "rawHtml" TEXT,
    "cleanText" TEXT NOT NULL,
    "headline" TEXT,
    "canonicalUrl" TEXT,
    "sourceDomain" TEXT,
    "publishedAt" TIMESTAMP(3),
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "language" TEXT,
    "extractionMethod" TEXT NOT NULL,
    "textLength" INTEGER NOT NULL,
    "qualityScore" DOUBLE PRECISION,
    "qualityFlags" JSONB,
    "dedupHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsItem" (
    "id" TEXT NOT NULL,
    "extractedDocId" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "summaryEditorial" TEXT,
    "summaryExtraction" JSONB,
    "entities" JSONB,
    "topics" JSONB,
    "deliveredAt" TIMESTAMP(3),
    "deliveryStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "newsItemId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "paragraphIndex" INTEGER,
    "charStart" INTEGER,
    "charEnd" INTEGER,
    "factCheckVerdict" TEXT,
    "factCheckConfidence" DOUBLE PRECISION,
    "factCheckSources" JSONB,
    "factCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "content" TEXT,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryLog" (
    "id" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "newsItemId" TEXT,
    "endpointUrl" TEXT NOT NULL,
    "statusCode" INTEGER,
    "requestId" TEXT,
    "errorMsg" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyBudgetUsage" (
    "id" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "limit" INTEGER NOT NULL,

    CONSTRAINT "DailyBudgetUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyTuningRun" (
    "id" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recommendations" JSONB NOT NULL,
    "appliedChanges" JSONB,

    CONSTRAINT "DailyTuningRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "Theme_slug_key" ON "Theme"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Subtopic_themeId_slug_key" ON "Subtopic"("themeId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ThemeDeliveryEndpoint_themeId_key" ON "ThemeDeliveryEndpoint"("themeId");

-- CreateIndex
CREATE UNIQUE INDEX "DomainRule_themeId_domain_key" ON "DomainRule"("themeId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractedDocument_scrapeJobId_key" ON "ExtractedDocument"("scrapeJobId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsItem_extractedDocId_key" ON "NewsItem"("extractedDocId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyBudgetUsage_themeId_date_key" ON "DailyBudgetUsage"("themeId", "date");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subtopic" ADD CONSTRAINT "Subtopic_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThemeConfig" ADD CONSTRAINT "ThemeConfig_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigChangeLog" ADD CONSTRAINT "ConfigChangeLog_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ThemeConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThemeDeliveryEndpoint" ADD CONSTRAINT "ThemeDeliveryEndpoint_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainRule" ADD CONSTRAINT "DomainRule_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionJob" ADD CONSTRAINT "IngestionJob_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapeJob" ADD CONSTRAINT "ScrapeJob_ingestionJobId_fkey" FOREIGN KEY ("ingestionJobId") REFERENCES "IngestionJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionAttempt" ADD CONSTRAINT "ExtractionAttempt_scrapeJobId_fkey" FOREIGN KEY ("scrapeJobId") REFERENCES "ScrapeJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedDocument" ADD CONSTRAINT "ExtractedDocument_scrapeJobId_fkey" FOREIGN KEY ("scrapeJobId") REFERENCES "ScrapeJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedDocument" ADD CONSTRAINT "ExtractedDocument_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsItem" ADD CONSTRAINT "NewsItem_extractedDocId_fkey" FOREIGN KEY ("extractedDocId") REFERENCES "ExtractedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsItem" ADD CONSTRAINT "NewsItem_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_newsItemId_fkey" FOREIGN KEY ("newsItemId") REFERENCES "NewsItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryLog" ADD CONSTRAINT "DeliveryLog_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyBudgetUsage" ADD CONSTRAINT "DailyBudgetUsage_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTuningRun" ADD CONSTRAINT "DailyTuningRun_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
