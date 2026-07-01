export type AuthAccountType = "broadcaster" | "bot";

export type AuthAccountStatus =
  | {
      connected: false;
    }
  | {
      connected: true;
      id: string;
      providerUserId: string;
      login: string;
      displayName: string;
      scopes: string[];
      expiresAt: string | null;
    };

export type AuthStatus = {
  broadcaster: AuthAccountStatus;
  bot: AuthAccountStatus;
};

export type RefreshAuthResponse = {
  ok: boolean;
  accountType: AuthAccountType;
  login: string;
  scopes: string[];
  expiresAt: string | null;
};