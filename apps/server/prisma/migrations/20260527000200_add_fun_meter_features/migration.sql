-- CreateTable
CREATE TABLE "FunMeterFeature" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'см',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "aliases" TEXT[],
    "leaderboardArgs" TEXT[],
    "selfArgs" TEXT[],
    "minRoll" INTEGER NOT NULL DEFAULT 1,
    "maxRoll" INTEGER NOT NULL DEFAULT 20,
    "jokes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FunMeterFeature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FunMeterFeature_key_key" ON "FunMeterFeature"("key");

-- CreateIndex
CREATE INDEX "FunMeterFeature_enabled_idx" ON "FunMeterFeature"("enabled");

-- Seed the first internal mapped fun feature.
INSERT INTO "FunMeterFeature" (
    "id",
    "key",
    "title",
    "unit",
    "enabled",
    "aliases",
    "leaderboardArgs",
    "selfArgs",
    "minRoll",
    "maxRoll",
    "jokes",
    "updatedAt"
) VALUES (
    'fun_meter_feature_penis_meter',
    'penis_meter',
    'Вимір пеніса',
    'см',
    true,
    ARRAY['meter', 'penis', 'pp', 'пеніс', 'пісюн', 'член', 'розмір'],
    ARRAY['top', 'leaderboard', 'лідери', 'топ'],
    ARRAY['me', 'my', 'я', 'мій', 'моє'],
    1,
    20,
    '{
      "increaseLow": [
        "Сантиметр прокинувся і зробив зарядку.",
        "Маленький крок для стрімера, великий для статистики.",
        "Рулетка кивнула з повагою."
      ],
      "increaseMedium": [
        "Лінійка попросила відпустку.",
        "Статистика сьогодні явно на твоєму боці.",
        "Чат почув впевнене клацання рулетки."
      ],
      "increaseHigh": [
        "Рулетка закінчилась, шукаємо будівельну.",
        "Це вже не вимір, це архітектурний проєкт.",
        "Фізика попросила не ставити зайвих питань."
      ],
      "decreaseLow": [
        "Трохи сором''язливості у прямому ефірі.",
        "Рулетка чхнула і збила показник.",
        "Мінус дрібний, але драматичний."
      ],
      "decreaseMedium": [
        "Холодна вода зробила свою справу.",
        "Статистика сьогодні з характером.",
        "Рулетка сказала: не цього разу."
      ],
      "decreaseHigh": [
        "Гравітація втрутилась без попередження.",
        "Це був болючий аудит сантиметрів.",
        "Результат пішов у режим економії."
      ],
      "zeroBlocked": [
        "Мінусувати повітря заборонено.",
        "Нуль тримає оборону.",
        "Бот спробував, але математика сказала ні."
      ]
    }'::jsonb,
    CURRENT_TIMESTAMP
) ON CONFLICT ("key") DO NOTHING;
