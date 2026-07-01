-- AlterTable
ALTER TABLE "EconomySettings" ADD COLUMN     "buffBuyCommand" TEXT NOT NULL DEFAULT 'купити',
ADD COLUMN     "buffListCommand" TEXT NOT NULL DEFAULT 'бафи';
