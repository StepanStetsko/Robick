export type EconomyMessageTemplates = {
  balanceMessage: string;
  topTitle: string;
  topEntry: string;
  topEmpty: string;
  giveSuccess: string;
  giveInsufficient: string;
  giveInvalidTarget: string;
  giveInvalidAmount: string;
  giveSelf: string;
  buffRollWon: string;
  buffRollCooldown: string;
  buffRollEmpty: string;
  buffInsufficient: string;
  buffCatalogTitle: string;
  buffCatalogEntry: string;
  buffCatalogEmpty: string;
  rouletteWin: string;
  rouletteLose: string;
  rouletteNoBet: string;
  rouletteInvalidBet: string;
  rouletteInsufficient: string;
  rouletteLeaderMustAllIn: string;
  rouletteLeaderTransferBlocked: string;
  rouletteCooldown: string;
  stealSuccess: string;
  stealFail: string;
  stealNoTarget: string;
  stealSelf: string;
  stealCooldown: string;
  stealVictimImmune: string;
  stealTargetUnavailable: string;
  stealShielded: string;
  stealTargetTooPoor: string;
  shieldBought: string;
  shieldAlreadyActive: string;
  shieldInsufficient: string;
  stealWarning: string;
  stealDefended: string;
  fightChallenge: string;
  fightAccepted: string;
  fightWin: string;
  fightExpired: string;
  fightInsufficient: string;
  fightNoTarget: string;
  fightSelf: string;
  fightCooldown: string;
  fightBusy: string;
  statusMessage: string;
  statusNone: string;
  help: string;
};

export const defaultEconomyMessages: EconomyMessageTemplates = {
  balanceMessage:
    "@{displayName}, твій баланс: {balance} {unit}. Позиція в рейтингу: #{rank}.",
  topTitle: "🏆 Топ за балансом:",
  topEntry: "{rank}. {displayName} — {balance} {unit}",
  topEmpty: "🏆 Поки нікого немає в топі.",
  giveSuccess:
    "@{fromDisplayName} передав {amount} {unit} → @{toDisplayName}. Твій баланс: {fromBalance} {unit}.",
  giveInsufficient:
    "@{displayName}, недостатньо балів. Твій баланс: {balance} {unit}.",
  giveInvalidTarget:
    "@{displayName}, вкажи кому передати: !{giveCommand} @нік {amountExample}.",
  giveInvalidAmount:
    "@{displayName}, вкажи коректну суму: !{giveCommand} @нік {amountExample}.",
  giveSelf: "@{displayName}, не можна передати балі самому собі.",
  buffRollWon:
    "@{displayName} крутить ефект 🎲 і отримує {kindLabel} «{title}» ({effect})! Баланс: {balance} {unit}.",
  buffRollCooldown:
    "@{displayName}, ефект ще перезаряджається. Спробуй за {secondsLeft} с.",
  buffRollEmpty:
    "@{displayName}, зараз немає доступних ефектів.",
  buffInsufficient:
    "@{displayName}, недостатньо балів для ефекту (ціна {cost} {unit}). Баланс: {balance} {unit}.",
  buffCatalogTitle: "🎲 Можливі ефекти:",
  buffCatalogEntry: "{title} — {kindLabel} ({effect})",
  buffCatalogEmpty: "🎲 Поки немає доступних ефектів.",
  rouletteWin:
    "@{displayName} ставить {bet} {unit} і ВИГРАЄ 🎰 +{winnings} {unit}! Баланс: {balance} {unit}.",
  rouletteLose:
    "@{displayName} ставить {bet} {unit} і програє 💀 Баланс: {balance} {unit}.",
  rouletteNoBet:
    "@{displayName}, вкажи ставку: !{rouletteCommand} <сума>.",
  rouletteInvalidBet:
    "@{displayName}, некоректна ставка. Мін: {minBet} {unit}.",
  rouletteInsufficient:
    "@{displayName}, недостатньо балів для ставки {bet} {unit}. Баланс: {balance} {unit}.",
  rouletteLeaderMustAllIn:
    "@{displayName}, ти лідер 👑 — крутити рулетку можна лише на все: !{rouletteCommand} all.",
  rouletteLeaderTransferBlocked:
    "@{displayName}, передавати балі не можна, поки ти лідер 👑 — спочатку !{rouletteCommand} all.",
  rouletteCooldown:
    "@{displayName}, рулетка ще перезаряджається. Спробуй за {secondsLeft} с.",
  stealSuccess:
    "@{thiefName} обікрав @{victimName} на {amount} {unit}! 😈 Баланс: {balance} {unit}.",
  stealFail:
    "@{thiefName} спробував обікрасти @{victimName}, але попався 🚓 і платить {fine} {unit}. Баланс: {balance} {unit}.",
  stealNoTarget: "@{displayName}, вкажи кого обікрасти: !{stealCommand} @нік.",
  stealSelf: "@{displayName}, у себе вкрасти не вийде.",
  stealCooldown:
    "@{displayName}, ще рано красти. Спробуй за {secondsLeft} с.",
  stealVictimImmune:
    "@{displayName}, цю ціль нещодавно вже грабували — дай їй спокій.",
  stealTargetUnavailable:
    "@{displayName}, красти можна лише в люркерів, що зараз у чаті.",
  stealShielded: "@{displayName}, ціль під щитом 🛡️ — не вкрасти.",
  stealTargetTooPoor:
    "@{displayName}, у цілі надто мало балів, щоб красти.",
  shieldBought:
    "@{displayName}, щит 🛡️ активний на {minutes} хв. Баланс: {balance} {unit}.",
  shieldAlreadyActive:
    "@{displayName}, щит уже активний (ще {secondsLeft} с).",
  shieldInsufficient:
    "@{displayName}, недостатньо балів для щита (ціна {cost} {unit}). Баланс: {balance} {unit}.",
  stealWarning:
    "@{victimName}, тебе намагається обікрасти @{thiefName}! У тебе {seconds} с — напиши щось у чат або купи !{shieldCommand}, щоб захиститись.",
  stealDefended:
    "@{victimName} відбився! 🛡️ @{thiefName} спіймали і він платить {fine} {unit} → @{victimName}.",
  fightChallenge:
    "🥊 @{challengerName} викликає @{targetName} на бій за {stake} {unit}! @{targetName}, напиши !{fightAcceptCommand} ({seconds} с), щоб прийняти.",
  fightAccepted: "🥊 Бій починається: @{challengerName} vs @{targetName} за {stake} {unit}!",
  fightWin:
    "🏆 @{winnerName} перемагає @{loserName} і забирає {stake} {unit}! Баланс: {balance} {unit}.",
  fightExpired: "⌛ @{challengerName}, виклик на бій згорів — @{targetName} не відповів.",
  fightInsufficient:
    "@{displayName}, недостатньо балів для бою на {stake} {unit}. Баланс: {balance} {unit}.",
  fightNoTarget: "@{displayName}, вкажи суперника: !{fightCommand} @нік <ставка>.",
  fightSelf: "@{displayName}, сам із собою не поб'єшся.",
  fightCooldown: "@{displayName}, ще рано викликати на бій. Спробуй за {secondsLeft} с.",
  fightBusy: "@{displayName}, виклик уже триває — дочекайся завершення.",
  statusMessage:
    "@{displayName} — баланс: {balance} {unit} | бафи: {buffs} | дебафи: {debuffs} | щит: {shield}",
  statusNone: "немає",
  help: "📋 Команди: {commands}",
};

export function normalizeEconomyMessages(
  value: unknown,
): EconomyMessageTemplates {
  if (!isRecord(value)) {
    return defaultEconomyMessages;
  }

  return {
    balanceMessage: normalizeTemplate(
      value.balanceMessage,
      defaultEconomyMessages.balanceMessage,
    ),
    topTitle: normalizeTemplate(value.topTitle, defaultEconomyMessages.topTitle),
    topEntry: normalizeTemplate(value.topEntry, defaultEconomyMessages.topEntry),
    topEmpty: normalizeTemplate(value.topEmpty, defaultEconomyMessages.topEmpty),
    giveSuccess: normalizeTemplate(
      value.giveSuccess,
      defaultEconomyMessages.giveSuccess,
    ),
    giveInsufficient: normalizeTemplate(
      value.giveInsufficient,
      defaultEconomyMessages.giveInsufficient,
    ),
    giveInvalidTarget: normalizeTemplate(
      value.giveInvalidTarget,
      defaultEconomyMessages.giveInvalidTarget,
    ),
    giveInvalidAmount: normalizeTemplate(
      value.giveInvalidAmount,
      defaultEconomyMessages.giveInvalidAmount,
    ),
    giveSelf: normalizeTemplate(value.giveSelf, defaultEconomyMessages.giveSelf),
    buffRollWon: normalizeTemplate(
      value.buffRollWon,
      defaultEconomyMessages.buffRollWon,
    ),
    buffRollCooldown: normalizeTemplate(
      value.buffRollCooldown,
      defaultEconomyMessages.buffRollCooldown,
    ),
    buffRollEmpty: normalizeTemplate(
      value.buffRollEmpty,
      defaultEconomyMessages.buffRollEmpty,
    ),
    buffInsufficient: normalizeTemplate(
      value.buffInsufficient,
      defaultEconomyMessages.buffInsufficient,
    ),
    buffCatalogTitle: normalizeTemplate(
      value.buffCatalogTitle,
      defaultEconomyMessages.buffCatalogTitle,
    ),
    buffCatalogEntry: normalizeTemplate(
      value.buffCatalogEntry,
      defaultEconomyMessages.buffCatalogEntry,
    ),
    buffCatalogEmpty: normalizeTemplate(
      value.buffCatalogEmpty,
      defaultEconomyMessages.buffCatalogEmpty,
    ),
    rouletteWin: normalizeTemplate(
      value.rouletteWin,
      defaultEconomyMessages.rouletteWin,
    ),
    rouletteLose: normalizeTemplate(
      value.rouletteLose,
      defaultEconomyMessages.rouletteLose,
    ),
    rouletteNoBet: normalizeTemplate(
      value.rouletteNoBet,
      defaultEconomyMessages.rouletteNoBet,
    ),
    rouletteInvalidBet: normalizeTemplate(
      value.rouletteInvalidBet,
      defaultEconomyMessages.rouletteInvalidBet,
    ),
    rouletteInsufficient: normalizeTemplate(
      value.rouletteInsufficient,
      defaultEconomyMessages.rouletteInsufficient,
    ),
    rouletteLeaderMustAllIn: normalizeTemplate(
      value.rouletteLeaderMustAllIn,
      defaultEconomyMessages.rouletteLeaderMustAllIn,
    ),
    rouletteLeaderTransferBlocked: normalizeTemplate(
      value.rouletteLeaderTransferBlocked,
      defaultEconomyMessages.rouletteLeaderTransferBlocked,
    ),
    rouletteCooldown: normalizeTemplate(
      value.rouletteCooldown,
      defaultEconomyMessages.rouletteCooldown,
    ),
    stealSuccess: normalizeTemplate(
      value.stealSuccess,
      defaultEconomyMessages.stealSuccess,
    ),
    stealFail: normalizeTemplate(
      value.stealFail,
      defaultEconomyMessages.stealFail,
    ),
    stealNoTarget: normalizeTemplate(
      value.stealNoTarget,
      defaultEconomyMessages.stealNoTarget,
    ),
    stealSelf: normalizeTemplate(
      value.stealSelf,
      defaultEconomyMessages.stealSelf,
    ),
    stealCooldown: normalizeTemplate(
      value.stealCooldown,
      defaultEconomyMessages.stealCooldown,
    ),
    stealVictimImmune: normalizeTemplate(
      value.stealVictimImmune,
      defaultEconomyMessages.stealVictimImmune,
    ),
    stealTargetUnavailable: normalizeTemplate(
      value.stealTargetUnavailable,
      defaultEconomyMessages.stealTargetUnavailable,
    ),
    stealShielded: normalizeTemplate(
      value.stealShielded,
      defaultEconomyMessages.stealShielded,
    ),
    stealTargetTooPoor: normalizeTemplate(
      value.stealTargetTooPoor,
      defaultEconomyMessages.stealTargetTooPoor,
    ),
    shieldBought: normalizeTemplate(
      value.shieldBought,
      defaultEconomyMessages.shieldBought,
    ),
    shieldAlreadyActive: normalizeTemplate(
      value.shieldAlreadyActive,
      defaultEconomyMessages.shieldAlreadyActive,
    ),
    shieldInsufficient: normalizeTemplate(
      value.shieldInsufficient,
      defaultEconomyMessages.shieldInsufficient,
    ),
    statusMessage: normalizeTemplate(
      value.statusMessage,
      defaultEconomyMessages.statusMessage,
    ),
    stealWarning: normalizeTemplate(
      value.stealWarning,
      defaultEconomyMessages.stealWarning,
    ),
    stealDefended: normalizeTemplate(
      value.stealDefended,
      defaultEconomyMessages.stealDefended,
    ),
    fightChallenge: normalizeTemplate(
      value.fightChallenge,
      defaultEconomyMessages.fightChallenge,
    ),
    fightAccepted: normalizeTemplate(
      value.fightAccepted,
      defaultEconomyMessages.fightAccepted,
    ),
    fightWin: normalizeTemplate(value.fightWin, defaultEconomyMessages.fightWin),
    fightExpired: normalizeTemplate(
      value.fightExpired,
      defaultEconomyMessages.fightExpired,
    ),
    fightInsufficient: normalizeTemplate(
      value.fightInsufficient,
      defaultEconomyMessages.fightInsufficient,
    ),
    fightNoTarget: normalizeTemplate(
      value.fightNoTarget,
      defaultEconomyMessages.fightNoTarget,
    ),
    fightSelf: normalizeTemplate(
      value.fightSelf,
      defaultEconomyMessages.fightSelf,
    ),
    fightCooldown: normalizeTemplate(
      value.fightCooldown,
      defaultEconomyMessages.fightCooldown,
    ),
    fightBusy: normalizeTemplate(
      value.fightBusy,
      defaultEconomyMessages.fightBusy,
    ),
    statusNone: normalizeTemplate(
      value.statusNone,
      defaultEconomyMessages.statusNone,
    ),
    help: normalizeTemplate(value.help, defaultEconomyMessages.help),
  };
}

function normalizeTemplate(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  return normalized || fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
