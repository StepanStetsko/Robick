-- AlterTable
ALTER TABLE "SongRequestSettings" ADD COLUMN     "pauseCommand" TEXT NOT NULL DEFAULT 'пауза',
ADD COLUMN     "skipVotesNeeded" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "voteSkipCommand" TEXT NOT NULL DEFAULT 'скіп';
