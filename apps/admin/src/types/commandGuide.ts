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
  updatedAt: string | null;
};
