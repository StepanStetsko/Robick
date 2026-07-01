-- CreateTable
CREATE TABLE "GiveawaySettings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'giveaway',
    "joinKeyword" TEXT NOT NULL DEFAULT 'участь',
    "maxAmount" INTEGER NOT NULL DEFAULT 100000,
    "durationSeconds" INTEGER NOT NULL DEFAULT 30,
    "reminderMinSeconds" INTEGER NOT NULL DEFAULT 7,
    "reminderMaxSeconds" INTEGER NOT NULL DEFAULT 10,
    "presets" JSONB,
    "messages" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiveawaySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GiveawaySettings_key_key" ON "GiveawaySettings"("key");
