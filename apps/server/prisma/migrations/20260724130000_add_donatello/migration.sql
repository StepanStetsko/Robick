-- CreateTable
CREATE TABLE "DonatelloSettings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'donatello',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "songMinAmount" INTEGER NOT NULL DEFAULT 50,
    "songPriority" INTEGER NOT NULL DEFAULT 5,
    "currency" TEXT NOT NULL DEFAULT 'UAH',
    "thankYouInChat" BOOLEAN NOT NULL DEFAULT true,
    "messages" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DonatelloSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DonatelloDonation" (
    "id" TEXT NOT NULL,
    "pubId" TEXT NOT NULL,
    "clientName" TEXT,
    "amount" DOUBLE PRECISION,
    "currency" TEXT,
    "message" TEXT,
    "songRequestId" TEXT,
    "songTitle" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'received',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DonatelloDonation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DonatelloSettings_key_key" ON "DonatelloSettings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "DonatelloDonation_pubId_key" ON "DonatelloDonation"("pubId");

-- CreateIndex
CREATE INDEX "DonatelloDonation_createdAt_idx" ON "DonatelloDonation"("createdAt");
