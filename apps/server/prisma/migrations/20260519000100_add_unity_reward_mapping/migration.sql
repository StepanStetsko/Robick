-- Add Unity reward mapping support without changing existing Unreal mappings.
ALTER TABLE "RewardMapping"
  ADD COLUMN "unityEventName" TEXT,
  ADD COLUMN "targetTransports" TEXT[] NOT NULL DEFAULT ARRAY['unreal']::TEXT[];
