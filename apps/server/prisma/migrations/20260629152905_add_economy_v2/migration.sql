-- AlterTable
ALTER TABLE "EconomySettings" ADD COLUMN     "fightAcceptCommand" TEXT NOT NULL DEFAULT 'приймаю',
ADD COLUMN     "fightChallengeTimeoutSec" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "fightCommand" TEXT NOT NULL DEFAULT 'бійка',
ADD COLUMN     "fightCooldownSec" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "fightMaxBet" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fightMinBet" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "fightWinChancePercent" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "rouletteCooldownSec" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "rouletteLeaderLockEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "roulettePayoutPercent" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "rouletteWinChanceMaxPercent" INTEGER NOT NULL DEFAULT 55,
ADD COLUMN     "rouletteWinChanceMinPercent" INTEGER NOT NULL DEFAULT 40,
ADD COLUMN     "stealFinePercent" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "stealWarnSeconds" INTEGER NOT NULL DEFAULT 30,
ALTER COLUMN "rouletteMinBet" SET DEFAULT 10;

-- AlterTable
ALTER TABLE "GiveawaySettings" ADD COLUMN     "selfCommand" TEXT NOT NULL DEFAULT 'розіграшсвоїх';
