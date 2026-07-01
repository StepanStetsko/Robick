-- AlterTable
ALTER TABLE "BuffDefinition" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'buff';

-- AlterTable
ALTER TABLE "EconomySettings" ADD COLUMN     "buffRollChancePercent" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "buffRollCommand" TEXT NOT NULL DEFAULT 'рулетка',
ADD COLUMN     "buffRollCooldownSec" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "buffRollCost" INTEGER NOT NULL DEFAULT 100;
