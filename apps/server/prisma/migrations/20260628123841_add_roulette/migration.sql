-- AlterTable
ALTER TABLE "EconomySettings" ADD COLUMN     "rouletteCommand" TEXT NOT NULL DEFAULT 'рулетка',
ADD COLUMN     "rouletteMaxBet" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rouletteMinBet" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "rouletteWinChancePercent" INTEGER NOT NULL DEFAULT 50,
ALTER COLUMN "buffRollCommand" SET DEFAULT 'ефект';
