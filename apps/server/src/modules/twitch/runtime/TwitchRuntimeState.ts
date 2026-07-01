import { twitchRealtimeHub } from "../realtime/twitch-realtime-hub.js";

export type TwitchRuntimeStatus = {
  runtimeStarted: boolean;
  broadcasterConnected: boolean;
  botConnected: boolean;
  botSessionConnected: boolean;
  broadcasterSessionConnected: boolean;
  streamLive: boolean;
  lastEventAt: string | null;
};

export class TwitchRuntimeState {
  private runtimeStarted = false;
  private broadcasterConnected = false;
  private botConnected = false;
  private botSessionConnected = false;
  private broadcasterSessionConnected = false;
  private streamLive = false;
  private lastEventAt: string | null = null;

  setAccountsConnected(params: {
    broadcasterConnected: boolean;
    botConnected: boolean;
  }) {
    this.broadcasterConnected = params.broadcasterConnected;
    this.botConnected = params.botConnected;
    this.emit();
  }

  setRuntimeStarted(started: boolean) {
    this.runtimeStarted = started;
    this.emit();
  }

  isRuntimeStarted() {
    return this.runtimeStarted;
  }

  setStreamLive(live: boolean) {
    if (this.streamLive === live) {
      return;
    }

    this.streamLive = live;
    this.touchEvent();
    this.emit();
  }

  isStreamLive() {
    return this.streamLive;
  }

  setBotSessionConnected(connected: boolean) {
    this.botSessionConnected = connected;
    this.touchEvent();
    this.emit();
  }

  setBroadcasterSessionConnected(connected: boolean) {
    this.broadcasterSessionConnected = connected;
    this.touchEvent();
    this.emit();
  }

  resetSessions() {
    this.botSessionConnected = false;
    this.broadcasterSessionConnected = false;
    this.touchEvent();
    this.emit();
  }

  touchEvent() {
    this.lastEventAt = new Date().toISOString();
  }

  getStatus(): TwitchRuntimeStatus {
    return {
      runtimeStarted: this.runtimeStarted,
      broadcasterConnected: this.broadcasterConnected,
      botConnected: this.botConnected,
      botSessionConnected: this.botSessionConnected,
      broadcasterSessionConnected: this.broadcasterSessionConnected,
      streamLive: this.streamLive,
      lastEventAt: this.lastEventAt,
    };
  }

  private emit() {
    twitchRealtimeHub.publish("runtime.status", this.getStatus());
  }
}