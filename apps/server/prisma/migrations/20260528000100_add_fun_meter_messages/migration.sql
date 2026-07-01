-- AlterTable
ALTER TABLE "FunMeterFeature" ADD COLUMN "messages" JSONB NOT NULL DEFAULT '{
  "rollMessage": "{deltaWithSign} {unit}. {joke}",
  "zeroBlockedMessage": "бот хотів відняти {amount}, але там уже 0. {joke}",
  "rollChatMessage": "@{displayName} {message} Загалом: {score} {unit}.",
  "zeroBlockedChatMessage": "@{displayName}, {message}",
  "dailyLimitMessage": "@{displayName}, «{title}» можна використовувати раз на добу. Спробуй після опівночі або після перезапуску бота.",
  "leaderboardTitle": "🏆 Топ «{title}»:",
  "leaderboardEmpty": "🏆 Топ «{title}» поки порожній.",
  "leaderboardEntry": "{rank}. {displayName} — {score} {unit}",
  "selfScoreMessage": "@{displayName}, твій поточний результат у «{title}»: {score} {unit}. Позиція в рейтингу: #{rank}.",
  "unknownSubcommandMessage": "@{displayName}, доступно: !{alias}, !{alias} top, !{alias} me."
}'::jsonb;
