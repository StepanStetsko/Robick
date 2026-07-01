-- CreateTable
CREATE TABLE "ViewerFunStat" (
    "id" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "twitchUserId" TEXT NOT NULL,
    "userLogin" TEXT NOT NULL,
    "displayName" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "rollsCount" INTEGER NOT NULL DEFAULT 0,
    "lastDelta" INTEGER,
    "lastDirection" TEXT,
    "lastMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViewerFunStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ViewerFunStat_featureKey_twitchUserId_key" ON "ViewerFunStat"("featureKey", "twitchUserId");

-- CreateIndex
CREATE INDEX "ViewerFunStat_featureKey_score_idx" ON "ViewerFunStat"("featureKey", "score");

-- CreateIndex
CREATE INDEX "ViewerFunStat_featureKey_updatedAt_idx" ON "ViewerFunStat"("featureKey", "updatedAt");
