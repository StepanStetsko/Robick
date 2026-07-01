-- CreateTable
CREATE TABLE "GuessGameSettings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'guess',
    "command" TEXT NOT NULL DEFAULT 'цифри',
    "stopCommand" TEXT NOT NULL DEFAULT 'стопцифри',
    "reward" INTEGER NOT NULL DEFAULT 100,
    "maxRange" INTEGER NOT NULL DEFAULT 1000000,
    "maxDurationSeconds" INTEGER NOT NULL DEFAULT 3600,
    "messages" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuessGameSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuessGameSettings_key_key" ON "GuessGameSettings"("key");
