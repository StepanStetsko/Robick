-- CreateTable
CREATE TABLE "BuffSettings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'buff',
    "curseCommand" TEXT NOT NULL DEFAULT 'прокляти',
    "curseCooldownSec" INTEGER NOT NULL DEFAULT 300,
    "curseCost" INTEGER NOT NULL DEFAULT 200,
    "messages" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuffSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BuffSettings_key_key" ON "BuffSettings"("key");
