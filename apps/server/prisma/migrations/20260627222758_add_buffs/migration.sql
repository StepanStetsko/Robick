-- CreateTable
CREATE TABLE "BuffDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "effectType" TEXT NOT NULL DEFAULT 'chance',
    "magnitude" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationMode" TEXT NOT NULL DEFAULT 'time',
    "durationValue" INTEGER NOT NULL DEFAULT 10,
    "cost" INTEGER NOT NULL DEFAULT 100,
    "target" TEXT NOT NULL DEFAULT 'self',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuffDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActiveBuff" (
    "id" TEXT NOT NULL,
    "twitchUserId" TEXT NOT NULL,
    "userLogin" TEXT NOT NULL,
    "buffKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "effectType" TEXT NOT NULL,
    "magnitude" DOUBLE PRECISION NOT NULL,
    "durationMode" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "rollsRemaining" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'purchase',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActiveBuff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BuffDefinition_key_key" ON "BuffDefinition"("key");

-- CreateIndex
CREATE INDEX "ActiveBuff_twitchUserId_idx" ON "ActiveBuff"("twitchUserId");
