-- AlterTable
ALTER TABLE "SongRequestSettings" ADD COLUMN     "historyLimit" INTEGER NOT NULL DEFAULT 20;

-- CreateTable
CREATE TABLE "SongBlock" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "addedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SongBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SongBlock_videoId_key" ON "SongBlock"("videoId");
