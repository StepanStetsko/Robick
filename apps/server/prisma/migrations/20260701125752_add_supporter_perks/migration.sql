-- CreateTable
CREATE TABLE "SupporterSettings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'supporter',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "loyalStreakDays" INTEGER NOT NULL DEFAULT 5,
    "streakResetOnMissedStream" BOOLEAN NOT NULL DEFAULT true,
    "loyalMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "supporterMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "bonusCommand" TEXT NOT NULL DEFAULT 'бонус',
    "bonusCooldownSec" INTEGER NOT NULL DEFAULT 86400,
    "guestDailyBonus" INTEGER NOT NULL DEFAULT 50,
    "loyalDailyBonus" INTEGER NOT NULL DEFAULT 150,
    "supporterDailyBonus" INTEGER NOT NULL DEFAULT 400,
    "guestStreakBonus" INTEGER NOT NULL DEFAULT 10,
    "loyalStreakBonus" INTEGER NOT NULL DEFAULT 25,
    "supporterStreakBonus" INTEGER NOT NULL DEFAULT 60,
    "supporterSongPriority" INTEGER NOT NULL DEFAULT 1,
    "messages" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupporterSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupporterStatus" (
    "id" TEXT NOT NULL,
    "userLogin" TEXT NOT NULL,
    "twitchUserId" TEXT,
    "displayName" TEXT,
    "manualTier" TEXT,
    "manualUntil" TIMESTAMP(3),
    "monoSubId" TEXT,
    "monoUntil" TIMESTAMP(3),
    "streakDays" INTEGER NOT NULL DEFAULT 0,
    "lastStreamDay" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupporterStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupporterSettings_key_key" ON "SupporterSettings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "SupporterStatus_userLogin_key" ON "SupporterStatus"("userLogin");

-- CreateIndex
CREATE INDEX "SupporterStatus_manualTier_idx" ON "SupporterStatus"("manualTier");
