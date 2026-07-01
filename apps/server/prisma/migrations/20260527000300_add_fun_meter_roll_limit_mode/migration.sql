-- AlterTable
ALTER TABLE "FunMeterFeature" ADD COLUMN "rollLimitMode" TEXT NOT NULL DEFAULT 'daily';

-- Keep the first meter limited to once per local day by default.
UPDATE "FunMeterFeature"
SET "rollLimitMode" = 'daily'
WHERE "key" = 'penis_meter';
