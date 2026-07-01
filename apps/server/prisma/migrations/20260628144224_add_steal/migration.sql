-- AlterTable
ALTER TABLE "EconomySettings" ADD COLUMN     "shieldCommand" TEXT NOT NULL DEFAULT 'щит',
ADD COLUMN     "shieldCost" INTEGER NOT NULL DEFAULT 500,
ADD COLUMN     "shieldDurationMin" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "stealChancePercent" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "stealCommand" TEXT NOT NULL DEFAULT 'вкрасти',
ADD COLUMN     "stealMaxAmount" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "stealMaxPercent" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "stealMinPercent" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "stealThiefCooldownSec" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "stealVictimFloor" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "stealVictimImmunitySec" INTEGER NOT NULL DEFAULT 600;

-- CreateTable
CREATE TABLE "ViewerProtection" (
    "id" TEXT NOT NULL,
    "twitchUserId" TEXT NOT NULL,
    "userLogin" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViewerProtection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ViewerProtection_twitchUserId_key" ON "ViewerProtection"("twitchUserId");

-- CreateIndex
CREATE INDEX "ViewerProtection_expiresAt_idx" ON "ViewerProtection"("expiresAt");
