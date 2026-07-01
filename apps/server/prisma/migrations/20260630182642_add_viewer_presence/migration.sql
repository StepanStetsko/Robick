-- CreateTable
CREATE TABLE "ViewerPresence" (
    "id" TEXT NOT NULL,
    "twitchUserId" TEXT NOT NULL,
    "userLogin" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "presentNow" BOOLEAN NOT NULL DEFAULT false,
    "hasChatted" BOOLEAN NOT NULL DEFAULT false,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "lastChatAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViewerPresence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ViewerPresence_twitchUserId_key" ON "ViewerPresence"("twitchUserId");

-- CreateIndex
CREATE INDEX "ViewerPresence_day_idx" ON "ViewerPresence"("day");
