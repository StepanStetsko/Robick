export type DonatelloMessages = {
  songAdded: string;
};

export type DonatelloSettings = {
  enabled: boolean;
  songMinAmount: number;
  songPriority: number;
  currency: string;
  thankYouInChat: boolean;
  messages: DonatelloMessages;
  updatedAt: string;
};

export type UpdateDonatelloSettingsInput = Partial<
  Omit<DonatelloSettings, "updatedAt">
>;

export type DonatelloDonation = {
  id: string;
  pubId: string;
  clientName: string | null;
  amount: number | null;
  currency: string | null;
  message: string | null;
  songRequestId: string | null;
  songTitle: string | null;
  outcome: string;
  createdAt: string;
};
