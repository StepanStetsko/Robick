import path from "node:path";
import { env } from "../../config/env.js";
import { AuthRepository } from "../auth/AuthRepository.js";
import { TokenManagerService } from "../auth/TokenManagerService.js";
import { TwitchOAuthService } from "../auth/TwitchOAuthService.js";
import { UnityWebSocketServer } from "../unity/UnityWebSocketServer.js";
import { UnrealWebSocketServer } from "../unreal/UnrealWebSocketServer.js";
import { ChatCommandActionDispatcher } from "./commands/ChatCommandActionDispatcher.js";
import { CustomChatCommandRepository } from "./commands/custom/CustomChatCommandRepository.js";
import { CustomChatCommandService } from "./commands/custom/CustomChatCommandService.js";
import { twitchRealtimeHub } from "./realtime/twitch-realtime-hub.js";
import { FunMeterCommandRouter } from "./fun-meter/FunMeterCommandRouter.js";
import { FunMeterRepository } from "./fun-meter/FunMeterRepository.js";
import { FunMeterService } from "./fun-meter/FunMeterService.js";
import { EconomyRepository } from "./economy/EconomyRepository.js";
import { EconomyService } from "./economy/EconomyService.js";
import { EconomyCommandRouter } from "./economy/EconomyCommandRouter.js";
import { StatusCommandRouter } from "./economy/StatusCommandRouter.js";
import { HelpCommandRouter } from "./economy/HelpCommandRouter.js";
import { ChatActivityTracker } from "./economy/ChatActivityTracker.js";
import { PresenceEarningService } from "./economy/PresenceEarningService.js";
import { PresenceTracker } from "./economy/PresenceTracker.js";
import { PresenceLogService } from "./economy/PresenceLogService.js";
import { PresenceLogRepository } from "./economy/PresenceLogRepository.js";
import { SongRequestRepository } from "./song-request/SongRequestRepository.js";
import { SongQueueService } from "./song-request/SongQueueService.js";
import { SongRequestCommandRouter } from "./song-request/SongRequestCommandRouter.js";
import { SupporterRepository } from "./supporter/SupporterRepository.js";
import { SupporterService } from "./supporter/SupporterService.js";
import { SupporterBonusCommandRouter } from "./supporter/SupporterBonusCommandRouter.js";
import { ProtectionRepository } from "./steal/ProtectionRepository.js";
import { StealService } from "./steal/StealService.js";
import { StealCommandRouter } from "./steal/StealCommandRouter.js";
import { BuffRepository } from "./buffs/BuffRepository.js";
import { BuffService } from "./buffs/BuffService.js";
import { BuffCommandRouter } from "./buffs/BuffCommandRouter.js";
import { GiveawayRepository } from "./giveaway/GiveawayRepository.js";
import { GiveawayService } from "./giveaway/GiveawayService.js";
import { GiveawayCommandRouter } from "./giveaway/GiveawayCommandRouter.js";
import { GuessGameRepository } from "./guess/GuessGameRepository.js";
import { GuessGameService } from "./guess/GuessGameService.js";
import { GuessGameCommandRouter } from "./guess/GuessGameCommandRouter.js";
import { CommandGuideService } from "./command-guide/CommandGuideService.js";
import { RouletteCommandRouter } from "./roulette/RouletteCommandRouter.js";
import { LeaderLockService } from "./roulette/LeaderLockService.js";
import { FightService } from "./fights/FightService.js";
import { FightCommandRouter } from "./fights/FightCommandRouter.js";
import { EarningExclusionService } from "./economy/EarningExclusionService.js";
import { TwitchApiClient } from "./TwitchApiClient.js";
import { TwitchChatService } from "./TwitchChatService.js";
import { TwitchEventRouter } from "./TwitchEventRouter.js";
import { TwitchEventSubClient } from "./TwitchEventSubClient.js";
import { TwitchSubscriptionService } from "./TwitchSubscriptionService.js";
import { ChatMessageHandler } from "./handlers/ChatMessageHandler.js";
import { ChatSimulationService } from "./simulation/ChatSimulationService.js";
import { RewardRedemptionHandler } from "./handlers/RewardRedemptionHandler.js";
import { TwitchRuntimeService } from "./TwitchRuntimeService.js";
import { TwitchRuntimeState } from "./runtime/TwitchRuntimeState.js";
import { RewardMappingService } from "./rewards/RewardMappingService.js";
import { RewardCatalogService } from "./rewards/RewardCatalogService.js";
import { RewardActionPayloadBuilder } from "./rewards/RewardActionPayloadBuilder.js";
import {
  LocalLogRewardDispatcher,
  UnrealWebSocketRewardDispatcher,
  UnityWebSocketRewardDispatcher,
} from "./rewards/RewardActionDispatcher.js";
import { CompositeRewardActionDispatcher } from "./rewards/CompositeRewardActionDispatcher.js";

const authRepository = new AuthRepository();

const tokenManager = new TokenManagerService(
  authRepository,
  new TwitchOAuthService(),
);

const twitchApiClient = new TwitchApiClient(tokenManager);

const twitchChatService = new TwitchChatService(
  authRepository,
  twitchApiClient,
);

const customCommandsStoragePath = path.resolve(
  process.cwd(),
  "storage/twitch/custom-commands.json",
);

const customChatCommandRepository = new CustomChatCommandRepository(
  customCommandsStoragePath,
);

const customChatCommandService = new CustomChatCommandService(
  customChatCommandRepository,
);

const rewardMappingService = new RewardMappingService();
const rewardActionPayloadBuilder = new RewardActionPayloadBuilder();

const unrealWebSocketServer = new UnrealWebSocketServer({
  port: env.UNREAL_WS_PORT,
  host: env.UNREAL_WS_HOST,
  onStatusChanged: publishEngineStatus,
});

const unityWebSocketServer = new UnityWebSocketServer({
  port: env.UNITY_WS_PORT,
  host: env.UNITY_WS_HOST,
  onStatusChanged: publishEngineStatus,
  onCapabilitiesChanged: publishEngineCapabilities,
});

function publishEngineStatus() {
  twitchRealtimeHub.publish("engine.status", {
    unreal: unrealWebSocketServer.getStatus(),
    unity: unityWebSocketServer.getStatus(),
  });
}

function publishEngineCapabilities() {
  twitchRealtimeHub.publish("engine.capabilities", {
    unity: unityWebSocketServer.getCapabilities(),
  });
}

unrealWebSocketServer.start();
unityWebSocketServer.start();

const chatCommandActionDispatcher = new ChatCommandActionDispatcher(
  unrealWebSocketServer,
  unityWebSocketServer,
);

const rewardActionDispatcher = new CompositeRewardActionDispatcher([
  new LocalLogRewardDispatcher(),
  new UnrealWebSocketRewardDispatcher(unrealWebSocketServer),
  new UnityWebSocketRewardDispatcher(unityWebSocketServer),
]);

const rewardCatalogService = new RewardCatalogService(
  authRepository,
  twitchApiClient,
  rewardMappingService,
);

const funMeterRepository = new FunMeterRepository();
const funMeterService = new FunMeterService(funMeterRepository);

const economyRepository = new EconomyRepository();
const economyService = new EconomyService(economyRepository);
const leaderLockService = new LeaderLockService(economyRepository);
const earningExclusionService = new EarningExclusionService(authRepository);
const runtimeState = new TwitchRuntimeState();
const economyCommandRouter = new EconomyCommandRouter(
  twitchChatService,
  economyService,
  leaderLockService,
);

const buffRepository = new BuffRepository();
const buffService = new BuffService(buffRepository, economyService);
const protectionRepository = new ProtectionRepository();
const statusCommandRouter = new StatusCommandRouter(
  twitchChatService,
  economyService,
  buffService,
  protectionRepository,
);

const funMeterCommandRouter = new FunMeterCommandRouter(
  twitchChatService,
  funMeterService,
  buffService,
);

const giveawayRepository = new GiveawayRepository();
const giveawayService = new GiveawayService(
  giveawayRepository,
  twitchChatService,
  economyService,
);
const giveawayCommandRouter = new GiveawayCommandRouter(giveawayService);
const guessGameRepository = new GuessGameRepository();
const guessGameService = new GuessGameService(
  guessGameRepository,
  twitchChatService,
  economyService,
  buffService,
);
const guessGameCommandRouter = new GuessGameCommandRouter(guessGameService);
const rouletteCommandRouter = new RouletteCommandRouter(
  twitchChatService,
  economyService,
  buffService,
  leaderLockService,
);
const fightService = new FightService(
  twitchChatService,
  economyService,
  buffService,
);
const fightCommandRouter = new FightCommandRouter(economyService, fightService);
const chatActivityTracker = new ChatActivityTracker();
const presenceTracker = new PresenceTracker();
const presenceLogRepository = new PresenceLogRepository();
const presenceLogService = new PresenceLogService(presenceLogRepository);
const buffCommandRouter = new BuffCommandRouter(
  twitchChatService,
  economyService,
  buffService,
  presenceLogService,
  protectionRepository,
  earningExclusionService,
);
const supporterRepository = new SupporterRepository();
const supporterService = new SupporterService(supporterRepository);
const presenceEarningService = new PresenceEarningService(
  authRepository,
  twitchApiClient,
  economyService,
  chatActivityTracker,
  buffService,
  presenceTracker,
  presenceLogService,
  earningExclusionService,
  runtimeState,
  supporterService,
);

const stealService = new StealService(
  twitchChatService,
  economyService,
  chatActivityTracker,
  presenceTracker,
  protectionRepository,
  buffService,
);
const stealCommandRouter = new StealCommandRouter(
  twitchChatService,
  economyService,
  stealService,
);

const rewardRedemptionHandler = new RewardRedemptionHandler(
  rewardMappingService,
  rewardActionPayloadBuilder,
  rewardActionDispatcher,
);

const songRequestRepository = new SongRequestRepository();
const songQueueService = new SongQueueService(songRequestRepository);
const songRequestCommandRouter = new SongRequestCommandRouter(
  twitchChatService,
  songQueueService,
  supporterService,
);

// The help list and guide read live command names from all feature settings,
// so they are created after song-request and supporter services exist.
const helpCommandRouter = new HelpCommandRouter(
  twitchChatService,
  economyService,
  funMeterService,
  giveawayService,
  guessGameService,
  buffService,
  songQueueService,
  supporterService,
);
const commandGuideService = new CommandGuideService(
  economyService,
  funMeterService,
  giveawayService,
  guessGameService,
  songQueueService,
  supporterService,
  buffService,
);

const supporterBonusCommandRouter = new SupporterBonusCommandRouter(
  twitchChatService,
  supporterService,
  economyService,
);

const chatMessageHandler = new ChatMessageHandler(
  twitchChatService,
  customChatCommandService,
  chatCommandActionDispatcher,
  funMeterCommandRouter,
  economyService,
  economyCommandRouter,
  chatActivityTracker,
  buffCommandRouter,
  giveawayCommandRouter,
  statusCommandRouter,
  buffService,
  rouletteCommandRouter,
  stealCommandRouter,
  guessGameCommandRouter,
  helpCommandRouter,
  presenceLogService,
  stealService,
  fightCommandRouter,
  earningExclusionService,
  runtimeState,
  songRequestCommandRouter,
  supporterService,
  supporterBonusCommandRouter,
);

const chatSimulationService = new ChatSimulationService(
  twitchChatService,
  chatMessageHandler,
  economyService,
  buffService,
  presenceTracker,
  protectionRepository,
);

const eventRouter = new TwitchEventRouter(
  chatMessageHandler,
  rewardRedemptionHandler,
  runtimeState,
);

const subscriptionService = new TwitchSubscriptionService(
  authRepository,
  twitchApiClient,
);

const botEventSubClient = new TwitchEventSubClient(
  eventRouter,
  async (sessionId) => {
    await subscriptionService.ensureBotSubscriptions(sessionId);
  },
  {
    clientName: "bot",
    shouldReconnect: () => runtimeState.isRuntimeStarted(),
    onConnected: () => {
      runtimeState.setBotSessionConnected(true);
      runtimeState.touchEvent();
      console.log("[RUNTIME] bot session connected");
    },
    onDisconnected: () => {
      runtimeState.setBotSessionConnected(false);
      runtimeState.touchEvent();
      console.log("[RUNTIME] bot session disconnected");
    },
    onKeepalive: () => {
      runtimeState.touchEvent();
    },
  },
);

const broadcasterEventSubClient = new TwitchEventSubClient(
  eventRouter,
  async (sessionId) => {
    await subscriptionService.ensureBroadcasterSubscriptions(sessionId);
  },
  {
    clientName: "broadcaster",
    shouldReconnect: () => runtimeState.isRuntimeStarted(),
    onConnected: () => {
      runtimeState.setBroadcasterSessionConnected(true);
      runtimeState.touchEvent();
      console.log("[RUNTIME] broadcaster session connected");
    },
    onDisconnected: () => {
      runtimeState.setBroadcasterSessionConnected(false);
      runtimeState.touchEvent();
      console.log("[RUNTIME] broadcaster session disconnected");
    },
    onKeepalive: () => {
      runtimeState.touchEvent();
    },
  },
);

export const twitchRuntimeContainer = {
  authRepository,
  tokenManager,
  twitchApiClient,
  twitchChatService,
  customChatCommandRepository,
  customChatCommandService,
  rewardMappingService,
  rewardCatalogService,
  funMeterRepository,
  funMeterService,
  funMeterCommandRouter,
  economyRepository,
  economyService,
  economyCommandRouter,
  chatActivityTracker,
  presenceEarningService,
  buffRepository,
  buffService,
  buffCommandRouter,
  giveawayRepository,
  giveawayService,
  giveawayCommandRouter,
  guessGameRepository,
  guessGameService,
  guessGameCommandRouter,
  commandGuideService,
  rouletteCommandRouter,
  leaderLockService,
  fightService,
  fightCommandRouter,
  earningExclusionService,
  stealCommandRouter,
  stealService,
  presenceTracker,
  presenceLogService,
  protectionRepository,
  statusCommandRouter,
  helpCommandRouter,
  songRequestRepository,
  songQueueService,
  songRequestCommandRouter,
  supporterRepository,
  supporterService,
  supporterBonusCommandRouter,
  chatMessageHandler,
  chatSimulationService,
  rewardActionPayloadBuilder,
  rewardActionDispatcher,
  rewardRedemptionHandler,
  chatCommandActionDispatcher,
  runtimeState,
  eventRouter,
  subscriptionService,
  botEventSubClient,
  broadcasterEventSubClient,
  unrealWebSocketServer,
  unityWebSocketServer,
  runtimeService: new TwitchRuntimeService(
    authRepository,
    twitchApiClient,
    twitchChatService,
    customChatCommandService,
    subscriptionService,
    botEventSubClient,
    broadcasterEventSubClient,
    runtimeState,
    presenceEarningService,
    giveawayService,
    guessGameService,
    presenceLogService,
    stealService,
    fightService,
    leaderLockService,
  ),
};


