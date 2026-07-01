export type TwitchRuntimeStatus = {
  runtimeStarted: boolean;
  broadcasterConnected: boolean;
  botConnected: boolean;
  botSessionConnected: boolean;
  broadcasterSessionConnected: boolean;
  lastEventAt: string | null;
};