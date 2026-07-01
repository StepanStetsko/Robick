-- Allow reward mappings to target Unity without requiring an Unreal event name.
ALTER TABLE "RewardMapping"
  ALTER COLUMN "unrealEventName" DROP NOT NULL;
