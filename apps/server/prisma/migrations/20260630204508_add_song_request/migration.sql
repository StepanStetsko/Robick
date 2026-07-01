-- CreateTable
CREATE TABLE "SongRequest" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "durationSec" INTEGER,
    "thumbnailUrl" TEXT,
    "requestedBy" TEXT NOT NULL,
    "requesterId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'chat',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "playedAt" TIMESTAMP(3),

    CONSTRAINT "SongRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongRequestSettings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'song_request',
    "command" TEXT NOT NULL DEFAULT 'пісня',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maxQueuePerUser" INTEGER NOT NULL DEFAULT 2,
    "maxDurationSec" INTEGER NOT NULL DEFAULT 0,
    "perUserCooldownSec" INTEGER NOT NULL DEFAULT 0,
    "messages" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SongRequestSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SongRequest_status_priority_createdAt_idx" ON "SongRequest"("status", "priority", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SongRequestSettings_key_key" ON "SongRequestSettings"("key");
