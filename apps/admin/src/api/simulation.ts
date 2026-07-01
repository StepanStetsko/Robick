import { http } from "./http";
import type { ActiveBuff, BuffEffectType } from "../types/buffs";

type ApiResponse<T> = {
  ok: boolean;
  data: T;
};

export type SimulateChatInput = {
  text: string;
  userLogin?: string;
  displayName?: string;
  isBroadcaster?: boolean;
  isModerator?: boolean;
  newUserEachRun?: boolean;
  grantBefore?: number;
  applyEffectType?: BuffEffectType;
  applyEffectMagnitude?: number;
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
  activeBuffs: ActiveBuff[];
  target?: {
    twitchUserId: string;
    userLogin: string;
    balance: number;
  };
};

export async function simulateChat(
  payload: SimulateChatInput,
): Promise<SimulateChatResult> {
  const result = await http<ApiResponse<SimulateChatResult>>(
    "/api/twitch/simulate/chat",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  return result.data;
}
