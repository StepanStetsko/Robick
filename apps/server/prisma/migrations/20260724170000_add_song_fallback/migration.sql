-- AlterTable
ALTER TABLE "SongRequestSettings"
  ADD COLUMN "fallbackEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "fallbackSeed" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "fallbackBlockKeywords" TEXT NOT NULL DEFAULT '';
