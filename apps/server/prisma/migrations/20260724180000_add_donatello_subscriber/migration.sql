-- CreateTable
CREATE TABLE "DonatelloSubscriber" (
    "id" TEXT NOT NULL,
    "pubClientId" TEXT NOT NULL,
    "clientName" TEXT,
    "tierName" TEXT,
    "amount" DOUBLE PRECISION,
    "currency" TEXT,
    "twitchName" TEXT,
    "subscriptionStatus" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "successPayments" INTEGER,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DonatelloSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DonatelloSubscriber_pubClientId_key" ON "DonatelloSubscriber"("pubClientId");

-- CreateIndex
CREATE INDEX "DonatelloSubscriber_isActive_idx" ON "DonatelloSubscriber"("isActive");
