import { randomBytes } from "node:crypto";
import { BuffService } from "../buffs/BuffService.js";
import { EconomyService } from "../economy/EconomyService.js";
import { PresenceTracker } from "../economy/PresenceTracker.js";
import { ProtectionRepository } from "../steal/ProtectionRepository.js";
import type { ChatMessageHandler } from "../handlers/ChatMessageHandler.js";
import type { TwitchChatService } from "../TwitchChatService.js";
import type { ActiveBuffDto, BuffEffectType } from "../buffs/buff.types.js";
import type { TwitchChatMessageEvent } from "../twitch.types.js";

export type SimulateChatInput = {
  text: string;
  userLogin?: string;
  displayName?: string;
  isBroadcaster?: boolean;
  isModerator?: boolean;
  newUserEachRun?: boolean;
  grantBefore?: number;
  /** Optional: apply an effect to the test user before running (to test buffs). */
  applyEffectType?: BuffEffectType;
  applyEffectMagnitude?: number;
  /** Optional target (e.g. for !вкрасти / !передати) — a second simulated viewer. */
  targetLogin?: string;
  targetGrant?: number;
  targetPresentLurker?: boolean;
  targetShield?: boolean;
};

export type SimulateChatResult = {
  chatter: {
    twitchUserId: string;
    userLogin: string;
    displayName: string;
    badges: string[];
  };
  text: string;
  responses: string[];
  balance: number;
  activeBuffs: ActiveBuffDto[];
  target?: {
    twitchUserId: string;
    userLogin: string;
    balance: number;
  };
};

const SIM_BROADCASTER_ID = "sim:broadcaster";

/**
 * Drives the real chat command pipeline (ChatMessageHandler + all routers) from
 * a synthetic event so the admin can test commands without using live chat.
 * Bot replies are captured via TwitchChatService.runCaptured (never sent to
 * Twitch). Effects are real (currency/buffs are written for the simulated
 * viewer), so the result reports the resulting balance + active buffs.
 */
export class ChatSimulationService {
  constructor(
    private readonly chatService: TwitchChatService,
    private readonly chatMessageHandler: ChatMessageHandler,
    private readonly economyService: EconomyService,
    private readonly buffService: BuffService,
    private readonly presenceTracker: PresenceTracker,
    private readonly protectionRepository: ProtectionRepository,
  ) {}

  async simulateChat(input: SimulateChatInput): Promise<SimulateChatResult> {
    const text = (input.text ?? "").trim();

    if (!text) {
      throw new Error("EMPTY_MESSAGE");
    }

    const userLogin = (input.userLogin?.trim() || "simulator").toLowerCase();
    const displayName = input.displayName?.trim() || userLogin;
    const newUser = input.newUserEachRun ?? true;
    const twitchUserId = newUser
      ? `sim:${userLogin}:${randomBytes(4).toString("hex")}`
      : `sim:${userLogin}`;

    const grantBefore = Math.floor(input.grantBefore ?? 0);

    if (grantBefore > 0) {
      // "Top up to" semantics: only credit the shortfall so repeated runs on a
      // persistent sim user don't keep inflating the balance (which made the
      // post-run balance look inconsistent with the reported winnings).
      const current = await this.economyService.getBalance(twitchUserId);

      if (current < grantBefore) {
        await this.economyService.award(
          { twitchUserId, userLogin, displayName },
          grantBefore - current,
          "admin",
        );
      }
    }

    if (
      input.applyEffectType &&
      typeof input.applyEffectMagnitude === "number" &&
      Number.isFinite(input.applyEffectMagnitude)
    ) {
      await this.buffService.grantActiveBuff(
        { twitchUserId, userLogin, displayName },
        input.applyEffectType,
        input.applyEffectMagnitude,
      );
    }

    const badges: TwitchChatMessageEvent["badges"] = [];

    if (input.isBroadcaster) {
      badges.push({ set_id: "broadcaster", id: "1", info: "" });
    }

    if (input.isModerator) {
      badges.push({ set_id: "moderator", id: "1", info: "" });
    }

    const fragments: TwitchChatMessageEvent["message"]["fragments"] = [
      { type: "text", text },
    ];

    const targetUserId = await this.prepareTarget(input, fragments);

    const event: TwitchChatMessageEvent = {
      broadcaster_user_id: input.isBroadcaster ? twitchUserId : SIM_BROADCASTER_ID,
      broadcaster_user_login: "broadcaster",
      broadcaster_user_name: "Broadcaster",
      chatter_user_id: twitchUserId,
      chatter_user_login: userLogin,
      chatter_user_name: displayName,
      message_id: `sim-${Date.now()}`,
      message: {
        text,
        fragments,
      },
      badges,
      message_type: "text",
    };

    const { messages } = await this.chatService.runCaptured(() =>
      this.chatMessageHandler.handle(event, { bypassChatCooldown: true }),
    );

    const [balance, activeBuffs] = await Promise.all([
      this.economyService.getBalance(twitchUserId),
      this.buffService.getActiveBuffs(twitchUserId),
    ]);

    const target = targetUserId
      ? {
          twitchUserId: targetUserId,
          userLogin: input.targetLogin!.trim().toLowerCase(),
          balance: await this.economyService.getBalance(targetUserId),
        }
      : undefined;

    return {
      chatter: {
        twitchUserId,
        userLogin,
        displayName,
        badges: badges.map((badge) => badge.set_id),
      },
      text,
      responses: messages,
      balance,
      activeBuffs,
      target,
    };
  }

  /**
   * Sets up a second simulated viewer (the target of !вкрасти / !передати):
   * gives them a wallet, optionally marks them a present lurker / shielded, and
   * injects a mention fragment so the routers resolve them. Returns the target
   * id, or null when no target was requested.
   */
  private async prepareTarget(
    input: SimulateChatInput,
    fragments: TwitchChatMessageEvent["message"]["fragments"],
  ): Promise<string | null> {
    const targetLogin = input.targetLogin?.trim().toLowerCase();

    if (!targetLogin) {
      return null;
    }

    const targetUserId = `sim:${targetLogin}`;
    const targetGrant = Math.floor(input.targetGrant ?? 0);

    if (targetGrant > 0) {
      const current = await this.economyService.getBalance(targetUserId);

      if (current < targetGrant) {
        await this.economyService.award(
          {
            twitchUserId: targetUserId,
            userLogin: targetLogin,
            displayName: targetLogin,
          },
          targetGrant - current,
          "admin",
        );
      }
    }

    // Shield toggle (deterministic): a future expiry enables it, a past one
    // clears any previously-set shield on this sim victim.
    const now = Date.now();
    await this.protectionRepository.upsert(
      targetUserId,
      targetLogin,
      new Date(now + (input.targetShield ? 3_600_000 : -1_000)),
    );

    // Present + never-touched (so ChatActivityTracker sees them as a lurker) =>
    // a valid steal target.
    if (input.targetPresentLurker ?? true) {
      this.presenceTracker.addPresent(targetUserId);
    }

    fragments.push({
      type: "mention",
      text: `@${targetLogin}`,
      mention: {
        user_id: targetUserId,
        user_login: targetLogin,
        user_name: targetLogin,
      },
    });

    return targetUserId;
  }
}
