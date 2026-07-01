export type OAuthPurpose = "connect" | "admin-login";

type StoredState = {
  accountType: "broadcaster" | "bot";
  purpose: OAuthPurpose;
  createdAt: number;
};

type CreateStateInput = {
  accountType: "broadcaster" | "bot";
  purpose?: OAuthPurpose;
};

export class OAuthStateStore {
  private readonly store = new Map<string, StoredState>();
  private readonly ttlMs = 1000 * 60 * 10;

  create(state: string, input: CreateStateInput) {
    this.cleanupExpired();
    this.store.set(state, {
      accountType: input.accountType,
      purpose: input.purpose ?? "connect",
      createdAt: Date.now(),
    });
  }

  consume(state: string) {
    this.cleanupExpired();

    const value = this.store.get(state);
    if (!value) {
      return null;
    }

    this.store.delete(state);
    return value;
  }

  private cleanupExpired() {
    const now = Date.now();

    for (const [key, value] of this.store.entries()) {
      if (now - value.createdAt > this.ttlMs) {
        this.store.delete(key);
      }
    }
  }
}
