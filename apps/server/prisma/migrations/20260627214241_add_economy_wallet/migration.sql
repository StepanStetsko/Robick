-- AlterTable
ALTER TABLE "FunMeterFeature" ALTER COLUMN "messages" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ViewerWallet" (
    "id" TEXT NOT NULL,
    "twitchUserId" TEXT NOT NULL,
    "userLogin" TEXT NOT NULL,
    "displayName" TEXT,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "earnedTotal" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViewerWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EconomySettings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'economy',
    "unit" TEXT NOT NULL DEFAULT 'балів',
    "chatActivityPoints" INTEGER NOT NULL DEFAULT 5,
    "chatActivityCooldownSec" INTEGER NOT NULL DEFAULT 60,
    "presencePointsPerTick" INTEGER NOT NULL DEFAULT 10,
    "presenceIntervalMin" INTEGER NOT NULL DEFAULT 5,
    "lurkerReductionPercent" INTEGER NOT NULL DEFAULT 50,
    "lurkerInactivityMin" INTEGER NOT NULL DEFAULT 5,
    "balanceCommand" TEXT NOT NULL DEFAULT 'баланс',
    "topCommand" TEXT NOT NULL DEFAULT 'топ',
    "giveCommand" TEXT NOT NULL DEFAULT 'передати',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EconomySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ViewerWallet_twitchUserId_key" ON "ViewerWallet"("twitchUserId");

-- CreateIndex
CREATE INDEX "ViewerWallet_balance_idx" ON "ViewerWallet"("balance");

-- CreateIndex
CREATE UNIQUE INDEX "EconomySettings_key_key" ON "EconomySettings"("key");
