import { z } from "zod";

export const COMMAND_GUIDE_KEY = "command_guide";

export type GuideRow = {
  command: string;
  description: string;
};

export type GuideGroup = {
  title: string;
  rows: GuideRow[];
};

export type CommandGuide = {
  groups: GuideGroup[];
  // ISO timestamp of the last manual/generated save, or null if never saved
  // (i.e. currently served straight from settings generation).
  updatedAt: string | null;
};

export const guideRowSchema = z.object({
  command: z.string().trim().max(200),
  description: z.string().trim().max(2000),
});

export const guideGroupSchema = z.object({
  title: z.string().trim().min(1).max(200),
  rows: z.array(guideRowSchema).max(200),
});

export const saveCommandGuideSchema = z.object({
  groups: z.array(guideGroupSchema).max(50),
});

export type SaveCommandGuideInput = z.infer<typeof saveCommandGuideSchema>;
