import { useEffect, useState, type FormEvent } from "react";
import {
  awardEconomy,
  deleteEconomyWallet,
  getEconomySettings,
  getEconomyWallets,
  purgeSimWallets,
  updateEconomySettings,
} from "../api/economy";
import type {
  EconomyMessages,
  EconomySettings,
  WalletEntry,
} from "../types/economy";

const WALLET_PAGE_SIZE = 50;

type TabId =
  | "award"
  | "roulette"
  | "steal"
  | "fight"
  | "buffs"
  | "messages"
  | "wallets";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "award", label: "Нарахування" },
  { id: "roulette", label: "Рулетка" },
  { id: "steal", label: "Крадіжка та щит" },
  { id: "fight", label: "Бійки" },
  { id: "buffs", label: "Бафи" },
  { id: "messages", label: "Повідомлення" },
  { id: "wallets", label: "Гаманці" },
];

type FormState = {
  unit: string;
  chatActivityPoints: number;
  chatActivityCooldownSec: number;
  presencePointsPerTick: number;
  presenceIntervalMin: number;
  lurkerReductionPercent: number;
  lurkerInactivityMin: number;
  balanceCommand: string;
  topCommand: string;
  giveCommand: string;
  buffListCommand: string;
  buffRollCommand: string;
  buffRollCost: number;
  buffRollCooldownSec: number;
  buffRollChancePercent: number;
  rouletteCommand: string;
  rouletteWinChanceMinPercent: number;
  rouletteWinChanceMaxPercent: number;
  roulettePayoutPercent: number;
  rouletteCooldownSec: number;
  rouletteLeaderLockEnabled: boolean;
  rouletteMinBet: number;
  rouletteMaxBet: number;
  stealCommand: string;
  stealChancePercent: number;
  stealMinPercent: number;
  stealMaxPercent: number;
  stealMaxAmount: number;
  stealVictimFloor: number;
  stealThiefCooldownSec: number;
  stealVictimImmunitySec: number;
  stealFinePercent: number;
  stealWarnSeconds: number;
  shieldCommand: string;
  shieldCost: number;
  shieldDurationMin: number;
  fightCommand: string;
  fightAcceptCommand: string;
  fightWinChancePercent: number;
  fightCooldownSec: number;
  fightChallengeTimeoutSec: number;
  fightMinBet: number;
  fightMaxBet: number;
  statusCommand: string;
  helpCommand: string;
  messages: EconomyMessages;
};

type MessageFieldMeta = {
  key: keyof EconomyMessages;
  label: string;
  hint?: string;
};

type MessageGroupMeta = {
  title: string;
  fields: MessageFieldMeta[];
};

const messageGroups: MessageGroupMeta[] = [
  {
    title: "Баланс і топ",
    fields: [
      {
        key: "balanceMessage",
        label: "Баланс",
        hint: "{displayName}, {balance}, {unit}, {rank}",
      },
      { key: "topTitle", label: "Топ — заголовок" },
      {
        key: "topEntry",
        label: "Топ — рядок",
        hint: "{rank}, {displayName}, {balance}, {unit}",
      },
      { key: "topEmpty", label: "Топ — порожньо" },
    ],
  },
  {
    title: "Передача балів",
    fields: [
      {
        key: "giveSuccess",
        label: "Успіх",
        hint: "{fromDisplayName}, {toDisplayName}, {amount}, {fromBalance}, {unit}",
      },
      {
        key: "giveInsufficient",
        label: "Недостатньо балів",
        hint: "{displayName}, {balance}, {unit}",
      },
      {
        key: "giveInvalidTarget",
        label: "Не вказано кому",
        hint: "{displayName}, {giveCommand}, {amountExample}",
      },
      {
        key: "giveInvalidAmount",
        label: "Невірна сума",
        hint: "{displayName}, {giveCommand}, {amountExample}",
      },
      { key: "giveSelf", label: "Самому собі", hint: "{displayName}" },
    ],
  },
  {
    title: "Ефекти (бафи / дебафи)",
    fields: [
      {
        key: "buffRollWon",
        label: "Ефект отримано",
        hint: "{displayName}, {kindLabel}, {title}, {effect}, {balance}, {unit}",
      },
      {
        key: "buffRollCooldown",
        label: "Кулдаун",
        hint: "{displayName}, {secondsLeft}",
      },
      { key: "buffRollEmpty", label: "Немає ефектів", hint: "{displayName}" },
      {
        key: "buffInsufficient",
        label: "Недостатньо балів",
        hint: "{displayName}, {cost}, {balance}, {unit}",
      },
      { key: "buffCatalogTitle", label: "Каталог — заголовок" },
      {
        key: "buffCatalogEntry",
        label: "Каталог — рядок",
        hint: "{title}, {kindLabel}, {effect}",
      },
      { key: "buffCatalogEmpty", label: "Каталог — порожньо" },
    ],
  },
  {
    title: "Рулетка",
    fields: [
      {
        key: "rouletteWin",
        label: "Виграш",
        hint: "{displayName}, {bet}, {winnings}, {balance}, {unit}",
      },
      {
        key: "rouletteLose",
        label: "Програш",
        hint: "{displayName}, {bet}, {balance}, {unit}",
      },
      {
        key: "rouletteNoBet",
        label: "Не вказано ставку",
        hint: "{displayName}, {rouletteCommand}",
      },
      {
        key: "rouletteInvalidBet",
        label: "Невірна ставка",
        hint: "{displayName}, {minBet}, {unit}",
      },
      {
        key: "rouletteInsufficient",
        label: "Недостатньо балів",
        hint: "{displayName}, {bet}, {balance}, {unit}",
      },
      {
        key: "rouletteCooldown",
        label: "Кулдаун",
        hint: "{displayName}, {secondsLeft}",
      },
      {
        key: "rouletteLeaderMustAllIn",
        label: "Лідер — лише all",
        hint: "{displayName}, {rouletteCommand}",
      },
      {
        key: "rouletteLeaderTransferBlocked",
        label: "Лідер — передача заблокована",
        hint: "{displayName}, {rouletteCommand}",
      },
    ],
  },
  {
    title: "Крадіжка та щит",
    fields: [
      {
        key: "stealSuccess",
        label: "Крадіжка вдала",
        hint: "{thiefName}, {victimName}, {amount}, {balance}, {unit}",
      },
      {
        key: "stealFail",
        label: "Спіймали (штраф)",
        hint: "{thiefName}, {victimName}, {fine}, {balance}, {unit}",
      },
      {
        key: "stealNoTarget",
        label: "Не вказано ціль",
        hint: "{displayName}, {stealCommand}",
      },
      { key: "stealSelf", label: "Сам у себе", hint: "{displayName}" },
      {
        key: "stealCooldown",
        label: "Кулдаун злодія",
        hint: "{displayName}, {secondsLeft}",
      },
      {
        key: "stealVictimImmune",
        label: "Ціль нещодавно грабували",
        hint: "{displayName}",
      },
      {
        key: "stealTargetUnavailable",
        label: "Ціль не люркер / не в чаті",
        hint: "{displayName}",
      },
      { key: "stealShielded", label: "Ціль під щитом", hint: "{displayName}" },
      {
        key: "stealTargetTooPoor",
        label: "У цілі замало балів",
        hint: "{displayName}",
      },
      {
        key: "shieldBought",
        label: "Щит куплено",
        hint: "{displayName}, {minutes}, {balance}, {unit}",
      },
      {
        key: "shieldAlreadyActive",
        label: "Щит уже активний",
        hint: "{displayName}, {secondsLeft}",
      },
      {
        key: "shieldInsufficient",
        label: "Замало на щит",
        hint: "{displayName}, {cost}, {balance}, {unit}",
      },
      {
        key: "stealWarning",
        label: "Попередження жертві (тег)",
        hint: "{victimName}, {thiefName}, {seconds}, {shieldCommand}",
      },
      {
        key: "stealDefended",
        label: "Жертва відбилась",
        hint: "{victimName}, {thiefName}, {fine}, {unit}",
      },
    ],
  },
  {
    title: "Бійки",
    fields: [
      {
        key: "fightChallenge",
        label: "Виклик",
        hint: "{challengerName}, {targetName}, {stake}, {unit}, {fightAcceptCommand}, {seconds}",
      },
      {
        key: "fightAccepted",
        label: "Прийнято",
        hint: "{challengerName}, {targetName}, {stake}, {unit}",
      },
      {
        key: "fightWin",
        label: "Перемога",
        hint: "{winnerName}, {loserName}, {stake}, {unit}, {balance}",
      },
      { key: "fightExpired", label: "Виклик згорів", hint: "{challengerName}, {targetName}" },
      {
        key: "fightInsufficient",
        label: "Недостатньо балів",
        hint: "{displayName}, {stake}, {balance}, {unit}",
      },
      { key: "fightNoTarget", label: "Немає суперника", hint: "{displayName}, {fightCommand}" },
      { key: "fightSelf", label: "Сам із собою", hint: "{displayName}" },
      { key: "fightCooldown", label: "Кулдаун", hint: "{displayName}, {secondsLeft}" },
      { key: "fightBusy", label: "Виклик уже триває", hint: "{displayName}" },
    ],
  },
  {
    title: "Профіль",
    fields: [
      {
        key: "statusMessage",
        label: "Профіль",
        hint: "{displayName}, {balance}, {unit}, {buffs}, {debuffs}, {shield}",
      },
      { key: "statusNone", label: "Порожній стан (немає бафів)" },
    ],
  },
];

type AwardState = {
  twitchUserId: string;
  userLogin: string;
  displayName: string;
  amount: number;
};

const emptyAward: AwardState = {
  twitchUserId: "",
  userLogin: "",
  displayName: "",
  amount: 100,
};

function settingsToForm(settings: EconomySettings): FormState {
  return {
    unit: settings.unit,
    chatActivityPoints: settings.chatActivityPoints,
    chatActivityCooldownSec: settings.chatActivityCooldownSec,
    presencePointsPerTick: settings.presencePointsPerTick,
    presenceIntervalMin: settings.presenceIntervalMin,
    lurkerReductionPercent: settings.lurkerReductionPercent,
    lurkerInactivityMin: settings.lurkerInactivityMin,
    balanceCommand: settings.balanceCommand,
    topCommand: settings.topCommand,
    giveCommand: settings.giveCommand,
    buffListCommand: settings.buffListCommand,
    buffRollCommand: settings.buffRollCommand,
    buffRollCost: settings.buffRollCost,
    buffRollCooldownSec: settings.buffRollCooldownSec,
    buffRollChancePercent: settings.buffRollChancePercent,
    rouletteCommand: settings.rouletteCommand,
    rouletteWinChanceMinPercent: settings.rouletteWinChanceMinPercent,
    rouletteWinChanceMaxPercent: settings.rouletteWinChanceMaxPercent,
    roulettePayoutPercent: settings.roulettePayoutPercent,
    rouletteCooldownSec: settings.rouletteCooldownSec,
    rouletteLeaderLockEnabled: settings.rouletteLeaderLockEnabled,
    rouletteMinBet: settings.rouletteMinBet,
    rouletteMaxBet: settings.rouletteMaxBet,
    stealCommand: settings.stealCommand,
    stealChancePercent: settings.stealChancePercent,
    stealMinPercent: settings.stealMinPercent,
    stealMaxPercent: settings.stealMaxPercent,
    stealMaxAmount: settings.stealMaxAmount,
    stealVictimFloor: settings.stealVictimFloor,
    stealThiefCooldownSec: settings.stealThiefCooldownSec,
    stealVictimImmunitySec: settings.stealVictimImmunitySec,
    stealFinePercent: settings.stealFinePercent,
    stealWarnSeconds: settings.stealWarnSeconds,
    shieldCommand: settings.shieldCommand,
    shieldCost: settings.shieldCost,
    shieldDurationMin: settings.shieldDurationMin,
    fightCommand: settings.fightCommand,
    fightAcceptCommand: settings.fightAcceptCommand,
    fightWinChancePercent: settings.fightWinChancePercent,
    fightCooldownSec: settings.fightCooldownSec,
    fightChallengeTimeoutSec: settings.fightChallengeTimeoutSec,
    fightMinBet: settings.fightMinBet,
    fightMaxBet: settings.fightMaxBet,
    statusCommand: settings.statusCommand,
    helpCommand: settings.helpCommand,
    messages: settings.messages,
  };
}

export function EconomyPage() {
  const [activeTab, setActiveTab] = useState<TabId>("award");
  const [form, setForm] = useState<FormState | null>(null);
  const [unit, setUnit] = useState("балів");
  const [wallets, setWallets] = useState<WalletEntry[]>([]);
  const [walletTotal, setWalletTotal] = useState(0);
  const [walletPage, setWalletPage] = useState(0);
  const [walletSearch, setWalletSearch] = useState("");
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [award, setAward] = useState<AwardState>(emptyAward);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [awarding, setAwarding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function loadSettings() {
    try {
      const settings = await getEconomySettings();
      setForm(settingsToForm(settings));
      setUnit(settings.unit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося завантажити налаштування");
    } finally {
      setLoading(false);
    }
  }

  async function loadWallets(page = walletPage, search = walletSearch) {
    setWalletsLoading(true);

    try {
      const result = await getEconomyWallets({
        limit: WALLET_PAGE_SIZE,
        offset: page * WALLET_PAGE_SIZE,
        search,
      });
      setWallets(result.entries);
      setWalletTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося завантажити гаманці");
    } finally {
      setWalletsLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  // Reload wallets on page change, and (debounced) on search change.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadWallets(walletPage, walletSearch);
    }, 300);

    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletPage, walletSearch]);

  async function handlePurgeSim() {
    if (!window.confirm("Видалити всі симуляторні (sim:) гаманці з бази?")) {
      return;
    }

    try {
      const removed = await purgeSimWallets();
      window.alert(`Видалено sim-гаманців: ${removed}`);
      setWalletPage(0);
      await loadWallets(0, walletSearch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося очистити sim-гаманці");
    }
  }

  async function handleDeleteWallet(wallet: WalletEntry) {
    const label = wallet.displayName || wallet.userLogin;
    if (!window.confirm(`Видалити гаманець ${label} (@${wallet.userLogin})?`)) {
      return;
    }

    try {
      await deleteEconomyWallet(wallet.twitchUserId);
      // If we just removed the last row on a non-first page, step back.
      if (wallets.length === 1 && walletPage > 0) {
        setWalletPage((page) => page - 1);
      } else {
        await loadWallets();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося видалити гаманець");
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form) {
      return;
    }

    setSaving(true);
    setSubmitError(null);
    setSavedAt(null);

    try {
      const updated = await updateEconomySettings({
        unit: form.unit,
        chatActivityPoints: form.chatActivityPoints,
        chatActivityCooldownSec: form.chatActivityCooldownSec,
        presencePointsPerTick: form.presencePointsPerTick,
        presenceIntervalMin: form.presenceIntervalMin,
        lurkerReductionPercent: form.lurkerReductionPercent,
        lurkerInactivityMin: form.lurkerInactivityMin,
        balanceCommand: form.balanceCommand,
        topCommand: form.topCommand,
        giveCommand: form.giveCommand,
        buffListCommand: form.buffListCommand,
        buffRollCommand: form.buffRollCommand,
        buffRollCost: form.buffRollCost,
        buffRollCooldownSec: form.buffRollCooldownSec,
        buffRollChancePercent: form.buffRollChancePercent,
        rouletteCommand: form.rouletteCommand,
        rouletteWinChanceMinPercent: form.rouletteWinChanceMinPercent,
        rouletteWinChanceMaxPercent: form.rouletteWinChanceMaxPercent,
        roulettePayoutPercent: form.roulettePayoutPercent,
        rouletteCooldownSec: form.rouletteCooldownSec,
        rouletteLeaderLockEnabled: form.rouletteLeaderLockEnabled,
        rouletteMinBet: form.rouletteMinBet,
        rouletteMaxBet: form.rouletteMaxBet,
        stealCommand: form.stealCommand,
        stealChancePercent: form.stealChancePercent,
        stealMinPercent: form.stealMinPercent,
        stealMaxPercent: form.stealMaxPercent,
        stealMaxAmount: form.stealMaxAmount,
        stealVictimFloor: form.stealVictimFloor,
        stealThiefCooldownSec: form.stealThiefCooldownSec,
        stealVictimImmunitySec: form.stealVictimImmunitySec,
        stealFinePercent: form.stealFinePercent,
        stealWarnSeconds: form.stealWarnSeconds,
        shieldCommand: form.shieldCommand,
        shieldCost: form.shieldCost,
        shieldDurationMin: form.shieldDurationMin,
        fightCommand: form.fightCommand,
        fightAcceptCommand: form.fightAcceptCommand,
        fightWinChancePercent: form.fightWinChancePercent,
        fightCooldownSec: form.fightCooldownSec,
        fightChallengeTimeoutSec: form.fightChallengeTimeoutSec,
        fightMinBet: form.fightMinBet,
        fightMaxBet: form.fightMaxBet,
        statusCommand: form.statusCommand,
        helpCommand: form.helpCommand,
        messages: form.messages,
      });

      setForm(settingsToForm(updated));
      setUnit(updated.unit);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Не вдалося зберегти");
    } finally {
      setSaving(false);
    }
  }

  async function handleAward(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAwarding(true);
    setError(null);

    try {
      await awardEconomy({
        twitchUserId: award.twitchUserId.trim(),
        userLogin: award.userLogin.trim(),
        displayName: award.displayName.trim() || undefined,
        amount: award.amount,
      });

      setAward(emptyAward);
      await loadWallets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося нарахувати");
    } finally {
      setAwarding(false);
    }
  }

  function setFormValue<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function setMessageValue(key: keyof EconomyMessages, value: string) {
    setForm((current) =>
      current
        ? { ...current, messages: { ...current.messages, [key]: value } }
        : current,
    );
  }

  function setAwardValue<K extends keyof AwardState>(key: K, value: AwardState[K]) {
    setAward((current) => ({ ...current, [key]: value }));
  }

  const activeTabLabel = TABS.find((tab) => tab.id === activeTab)?.label ?? "";

  return (
    <div className="page">
      <div className="card">
        <div className="card__header">
          <div>
            <h2 className="card__title">Економіка — {activeTabLabel}</h2>
            <p className="card__subtitle">
              Налаштування розбито на вкладки. Кнопка «Зберегти» застосовує всі
              вкладки одразу.
            </p>
          </div>
        </div>

        <div className="tabs__nav" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={
                activeTab === tab.id ? "tab-button tab-button--active" : "tab-button"
              }
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? <div className="state-block">Завантаження...</div> : null}

        {form && activeTab !== "wallets" ? (
          <form className="form" onSubmit={handleSave}>
            {activeTab === "award" ? (
              <>
                <p className="tab-panel__intro">
                  Валюта, пасивний заробіток (чат + присутність), люркер і базові
                  команди.
                </p>

                <label className="field">
                  <span className="field__label">Одиниця (валюта)</span>
                  <input
                    className="field__input"
                    value={form.unit}
                    onChange={(event) => setFormValue("unit", event.target.value)}
                    disabled={saving}
                    required
                  />
                </label>

                <div className="form form--inline">
                  <label className="field">
                    <span className="field__label">Балів за повідомлення</span>
                    <input
                      className="field__input"
                      type="number"
                      min={0}
                      value={form.chatActivityPoints}
                      onChange={(event) =>
                        setFormValue("chatActivityPoints", Number(event.target.value) || 0)
                      }
                      disabled={saving}
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Кулдаун чату (сек)</span>
                    <input
                      className="field__input"
                      type="number"
                      min={0}
                      value={form.chatActivityCooldownSec}
                      onChange={(event) =>
                        setFormValue(
                          "chatActivityCooldownSec",
                          Number(event.target.value) || 0,
                        )
                      }
                      disabled={saving}
                    />
                  </label>
                </div>

                <div className="form form--inline">
                  <label className="field">
                    <span className="field__label">Балів за тік присутності</span>
                    <input
                      className="field__input"
                      type="number"
                      min={0}
                      value={form.presencePointsPerTick}
                      onChange={(event) =>
                        setFormValue(
                          "presencePointsPerTick",
                          Number(event.target.value) || 0,
                        )
                      }
                      disabled={saving}
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Інтервал присутності (хв)</span>
                    <input
                      className="field__input"
                      type="number"
                      min={1}
                      value={form.presenceIntervalMin}
                      onChange={(event) =>
                        setFormValue("presenceIntervalMin", Number(event.target.value) || 1)
                      }
                      disabled={saving}
                    />
                  </label>
                </div>

                <div className="form form--inline">
                  <label className="field">
                    <span className="field__label">Урізання люркера (%)</span>
                    <input
                      className="field__input"
                      type="number"
                      min={0}
                      max={100}
                      value={form.lurkerReductionPercent}
                      onChange={(event) =>
                        setFormValue(
                          "lurkerReductionPercent",
                          Number(event.target.value) || 0,
                        )
                      }
                      disabled={saving}
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Вікно бездіяльності (хв)</span>
                    <input
                      className="field__input"
                      type="number"
                      min={1}
                      value={form.lurkerInactivityMin}
                      onChange={(event) =>
                        setFormValue("lurkerInactivityMin", Number(event.target.value) || 1)
                      }
                      disabled={saving}
                    />
                  </label>
                </div>

                <div className="command-ref__group">
                  <h3 className="command-ref__group-title">Базові команди</h3>

                  <label className="field">
                    <span className="field__label">Команда балансу</span>
                    <input
                      className="field__input"
                      value={form.balanceCommand}
                      onChange={(event) => setFormValue("balanceCommand", event.target.value)}
                      disabled={saving}
                      required
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Команда топу</span>
                    <input
                      className="field__input"
                      value={form.topCommand}
                      onChange={(event) => setFormValue("topCommand", event.target.value)}
                      disabled={saving}
                      required
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Команда передачі</span>
                    <input
                      className="field__input"
                      value={form.giveCommand}
                      onChange={(event) => setFormValue("giveCommand", event.target.value)}
                      disabled={saving}
                      required
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Команда профілю</span>
                    <input
                      className="field__input"
                      value={form.statusCommand}
                      onChange={(event) => setFormValue("statusCommand", event.target.value)}
                      disabled={saving}
                      required
                    />
                  </label>
                </div>
              </>
            ) : null}

            {activeTab === "roulette" ? (
              <>
                <p className="tab-panel__intro">
                  Гра на ставку з виплатою 1:1, випадковим шансом у діапазоні та
                  блокуванням лідера.
                </p>

                <label className="field">
                  <span className="field__label">Команда рулетки (ставка)</span>
                  <input
                    className="field__input"
                    value={form.rouletteCommand}
                    onChange={(event) =>
                      setFormValue("rouletteCommand", event.target.value)
                    }
                    disabled={saving}
                    required
                  />
                  <span className="field__hint">
                    Гра на ставку: !{form.rouletteCommand} 100 / all / 50% —
                    виплата 1:1 (виграш додається, програш забирає ставку)
                  </span>
                </label>

                <div className="form form--inline">
                  <label className="field">
                    <span className="field__label">Шанс виграшу мін (%)</span>
                    <input
                      className="field__input"
                      type="number"
                      min={1}
                      max={99}
                      value={form.rouletteWinChanceMinPercent}
                      onChange={(event) =>
                        setFormValue(
                          "rouletteWinChanceMinPercent",
                          Number(event.target.value) || 1,
                        )
                      }
                      disabled={saving}
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Шанс виграшу макс (%)</span>
                    <input
                      className="field__input"
                      type="number"
                      min={1}
                      max={99}
                      value={form.rouletteWinChanceMaxPercent}
                      onChange={(event) =>
                        setFormValue(
                          "rouletteWinChanceMaxPercent",
                          Number(event.target.value) || 1,
                        )
                      }
                      disabled={saving}
                    />
                    <span className="field__hint">
                      Шанс щоразу випадковий у цьому діапазоні
                    </span>
                  </label>

                  <label className="field">
                    <span className="field__label">Виплата (%)</span>
                    <input
                      className="field__input"
                      type="number"
                      min={1}
                      value={form.roulettePayoutPercent}
                      onChange={(event) =>
                        setFormValue(
                          "roulettePayoutPercent",
                          Number(event.target.value) || 1,
                        )
                      }
                      disabled={saving}
                    />
                    <span className="field__hint">100 = 1:1 (+ставка чистими)</span>
                  </label>
                </div>

                <div className="form form--inline">
                  <label className="field">
                    <span className="field__label">Кулдаун (с)</span>
                    <input
                      className="field__input"
                      type="number"
                      min={0}
                      value={form.rouletteCooldownSec}
                      onChange={(event) =>
                        setFormValue(
                          "rouletteCooldownSec",
                          Number(event.target.value) || 0,
                        )
                      }
                      disabled={saving}
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Мін. ставка</span>
                    <input
                      className="field__input"
                      type="number"
                      min={1}
                      value={form.rouletteMinBet}
                      onChange={(event) =>
                        setFormValue("rouletteMinBet", Number(event.target.value) || 1)
                      }
                      disabled={saving}
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Макс. ставка</span>
                    <input
                      className="field__input"
                      type="number"
                      min={0}
                      value={form.rouletteMaxBet}
                      onChange={(event) =>
                        setFormValue("rouletteMaxBet", Number(event.target.value) || 0)
                      }
                      disabled={saving}
                    />
                    <span className="field__hint">0 — без обмеження</span>
                  </label>
                </div>

                <label className="field field--checkbox">
                  <input
                    type="checkbox"
                    checked={form.rouletteLeaderLockEnabled}
                    onChange={(event) =>
                      setFormValue("rouletteLeaderLockEnabled", event.target.checked)
                    }
                    disabled={saving}
                  />
                  <span>
                    Блокування лідера (топ-1 крутить лише all + не може передавати,
                    поки не виграє all-in)
                  </span>
                </label>
              </>
            ) : null}

            {activeTab === "steal" ? (
              <>
                <p className="tab-panel__intro">
                  Крадіжка балів у люркерів зі штрафом і захист щитом.
                </p>

                <div className="form form--inline">
                  <label className="field">
                    <span className="field__label">Команда крадіжки</span>
                    <input
                      className="field__input"
                      value={form.stealCommand}
                      onChange={(event) =>
                        setFormValue("stealCommand", event.target.value)
                      }
                      disabled={saving}
                      required
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Команда щита</span>
                    <input
                      className="field__input"
                      value={form.shieldCommand}
                      onChange={(event) =>
                        setFormValue("shieldCommand", event.target.value)
                      }
                      disabled={saving}
                      required
                    />
                  </label>
                </div>

                <div className="form form--inline">
                  <label className="field">
                    <span className="field__label">Шанс крадіжки (%)</span>
                    <input
                      className="field__input"
                      type="number"
                      min={0}
                      max={100}
                      value={form.stealChancePercent}
                      onChange={(event) =>
                        setFormValue(
                          "stealChancePercent",
                          Number(event.target.value) || 0,
                        )
                      }
                      disabled={saving}
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Мін % від балансу</span>
                    <input
                      className="field__input"
                      type="number"
                      min={1}
                      max={100}
                      value={form.stealMinPercent}
                      onChange={(event) =>
                        setFormValue(
                          "stealMinPercent",
                          Number(event.target.value) || 1,
                        )
                      }
                      disabled={saving}
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Макс % від балансу</span>
                    <input
                      className="field__input"
                      type="number"
                      min={1}
                      max={100}
                      value={form.stealMaxPercent}
                      onChange={(event) =>
                        setFormValue(
                          "stealMaxPercent",
                          Number(event.target.value) || 1,
                        )
                      }
                      disabled={saving}
                    />
                  </label>
                </div>

                <div className="form form--inline">
                  <label className="field">
                    <span className="field__label">Кеп крадіжки (абс.)</span>
                    <input
                      className="field__input"
                      type="number"
                      min={1}
                      value={form.stealMaxAmount}
                      onChange={(event) =>
                        setFormValue(
                          "stealMaxAmount",
                          Number(event.target.value) || 1,
                        )
                      }
                      disabled={saving}
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Підлога жертви</span>
                    <input
                      className="field__input"
                      type="number"
                      min={0}
                      value={form.stealVictimFloor}
                      onChange={(event) =>
                        setFormValue(
                          "stealVictimFloor",
                          Number(event.target.value) || 0,
                        )
                      }
                      disabled={saving}
                    />
                    <span className="field__hint">
                      Не красти, якщо в цілі менше
                    </span>
                  </label>
                </div>

                <div className="form form--inline">
                  <label className="field">
                    <span className="field__label">Кулдаун злодія (с)</span>
                    <input
                      className="field__input"
                      type="number"
                      min={0}
                      value={form.stealThiefCooldownSec}
                      onChange={(event) =>
                        setFormValue(
                          "stealThiefCooldownSec",
                          Number(event.target.value) || 0,
                        )
                      }
                      disabled={saving}
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Імунітет жертви (с)</span>
                    <input
                      className="field__input"
                      type="number"
                      min={0}
                      value={form.stealVictimImmunitySec}
                      onChange={(event) =>
                        setFormValue(
                          "stealVictimImmunitySec",
                          Number(event.target.value) || 0,
                        )
                      }
                      disabled={saving}
                    />
                  </label>
                </div>

                <div className="form form--inline">
                  <label className="field">
                    <span className="field__label">Штраф злодія (% балансу)</span>
                    <input
                      className="field__input"
                      type="number"
                      min={0}
                      max={100}
                      value={form.stealFinePercent}
                      onChange={(event) =>
                        setFormValue(
                          "stealFinePercent",
                          Number(event.target.value) || 0,
                        )
                      }
                      disabled={saving}
                    />
                    <span className="field__hint">
                      На невдачу/відбиту крадіжку → жертві
                    </span>
                  </label>

                  <label className="field">
                    <span className="field__label">Попередження (с)</span>
                    <input
                      className="field__input"
                      type="number"
                      min={0}
                      max={300}
                      value={form.stealWarnSeconds}
                      onChange={(event) =>
                        setFormValue(
                          "stealWarnSeconds",
                          Number(event.target.value) || 0,
                        )
                      }
                      disabled={saving}
                    />
                    <span className="field__hint">
                      Тег жертви + час на захист (0 — без затримки)
                    </span>
                  </label>
                </div>

                <div className="form form--inline">
                  <label className="field">
                    <span className="field__label">Ціна щита</span>
                    <input
                      className="field__input"
                      type="number"
                      min={0}
                      value={form.shieldCost}
                      onChange={(event) =>
                        setFormValue("shieldCost", Number(event.target.value) || 0)
                      }
                      disabled={saving}
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Тривалість щита (хв)</span>
                    <input
                      className="field__input"
                      type="number"
                      min={1}
                      value={form.shieldDurationMin}
                      onChange={(event) =>
                        setFormValue(
                          "shieldDurationMin",
                          Number(event.target.value) || 1,
                        )
                      }
                      disabled={saving}
                    />
                  </label>
                </div>
              </>
            ) : null}

            {activeTab === "fight" ? (
              <>
                <p className="tab-panel__intro">
                  PvP-виклик зі ставкою: переможець забирає ставку суперника.
                </p>

                <div className="form form--inline">
                  <label className="field">
                    <span className="field__label">Команда бійки</span>
                    <input
                      className="field__input"
                      value={form.fightCommand}
                      onChange={(event) =>
                        setFormValue("fightCommand", event.target.value)
                      }
                      disabled={saving}
                      required
                    />
                    <span className="field__hint">
                      !{form.fightCommand} @нік 100 / all / 50%
                    </span>
                  </label>

                  <label className="field">
                    <span className="field__label">Команда прийняття</span>
                    <input
                      className="field__input"
                      value={form.fightAcceptCommand}
                      onChange={(event) =>
                        setFormValue("fightAcceptCommand", event.target.value)
                      }
                      disabled={saving}
                      required
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Шанс виклику (%)</span>
                    <input
                      className="field__input"
                      type="number"
                      min={0}
                      max={100}
                      value={form.fightWinChancePercent}
                      onChange={(event) =>
                        setFormValue(
                          "fightWinChancePercent",
                          Number(event.target.value) || 0,
                        )
                      }
                      disabled={saving}
                    />
                    <span className="field__hint">шанс перемоги того, хто викликав</span>
                  </label>
                </div>

                <div className="form form--inline">
                  <label className="field">
                    <span className="field__label">Кулдаун (с)</span>
                    <input
                      className="field__input"
                      type="number"
                      min={0}
                      value={form.fightCooldownSec}
                      onChange={(event) =>
                        setFormValue(
                          "fightCooldownSec",
                          Number(event.target.value) || 0,
                        )
                      }
                      disabled={saving}
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Час на прийняття (с)</span>
                    <input
                      className="field__input"
                      type="number"
                      min={5}
                      value={form.fightChallengeTimeoutSec}
                      onChange={(event) =>
                        setFormValue(
                          "fightChallengeTimeoutSec",
                          Number(event.target.value) || 5,
                        )
                      }
                      disabled={saving}
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Мін. ставка</span>
                    <input
                      className="field__input"
                      type="number"
                      min={1}
                      value={form.fightMinBet}
                      onChange={(event) =>
                        setFormValue("fightMinBet", Number(event.target.value) || 1)
                      }
                      disabled={saving}
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Макс. ставка</span>
                    <input
                      className="field__input"
                      type="number"
                      min={0}
                      value={form.fightMaxBet}
                      onChange={(event) =>
                        setFormValue("fightMaxBet", Number(event.target.value) || 0)
                      }
                      disabled={saving}
                    />
                    <span className="field__hint">0 — без обмеження</span>
                  </label>
                </div>
              </>
            ) : null}

            {activeTab === "buffs" ? (
              <>
                <p className="tab-panel__intro">
                  Рулетка ефектів: команди, ціна, кулдаун і шанс бафа проти дебафа.
                  Самі ефекти редагуються на сторінці «Бафи».
                </p>

                <div className="form form--inline">
                  <label className="field">
                    <span className="field__label">Команда видачі ефекту</span>
                    <input
                      className="field__input"
                      value={form.buffRollCommand}
                      onChange={(event) => setFormValue("buffRollCommand", event.target.value)}
                      disabled={saving}
                      required
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Команда списку ефектів</span>
                    <input
                      className="field__input"
                      value={form.buffListCommand}
                      onChange={(event) => setFormValue("buffListCommand", event.target.value)}
                      disabled={saving}
                      required
                    />
                  </label>
                </div>

                <div className="form form--inline">
                  <label className="field">
                    <span className="field__label">Ціна ефекту</span>
                    <input
                      className="field__input"
                      type="number"
                      min={0}
                      value={form.buffRollCost}
                      onChange={(event) =>
                        setFormValue("buffRollCost", Number(event.target.value) || 0)
                      }
                      disabled={saving}
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Кулдаун ефекту (сек)</span>
                    <input
                      className="field__input"
                      type="number"
                      min={0}
                      value={form.buffRollCooldownSec}
                      onChange={(event) =>
                        setFormValue(
                          "buffRollCooldownSec",
                          Number(event.target.value) || 0,
                        )
                      }
                      disabled={saving}
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Шанс бафа (%)</span>
                    <input
                      className="field__input"
                      type="number"
                      min={0}
                      max={100}
                      value={form.buffRollChancePercent}
                      onChange={(event) =>
                        setFormValue(
                          "buffRollChancePercent",
                          Number(event.target.value) || 0,
                        )
                      }
                      disabled={saving}
                    />
                    <span className="field__hint">
                      Решта — шанс дебафа
                    </span>
                  </label>
                </div>
              </>
            ) : null}

            {activeTab === "messages" ? (
              <>
                <p className="tab-panel__intro">
                  Тексти відповідей бота. Плейсхолдери у {"{фігурних дужках}"}
                  підставляються автоматично.
                </p>

                {messageGroups.map((group) => (
                  <div className="command-ref__group" key={group.title}>
                    <h3 className="command-ref__group-title">{group.title}</h3>

                    {group.fields.map((meta) => (
                      <label className="field" key={meta.key}>
                        <span className="field__label">{meta.label}</span>
                        <textarea
                          className="field__input field__input--textarea"
                          value={form.messages[meta.key]}
                          onChange={(event) =>
                            setMessageValue(meta.key, event.target.value)
                          }
                          disabled={saving}
                          rows={2}
                        />
                        {meta.hint ? (
                          <span className="field__hint">{meta.hint}</span>
                        ) : null}
                      </label>
                    ))}
                  </div>
                ))}
              </>
            ) : null}

            <div className="form__footer">
              <button className="button button--primary" type="submit" disabled={saving}>
                {saving ? "Збереження..." : "Зберегти"}
              </button>
              {submitError ? (
                <span className="field__hint" style={{ color: "#ffb5b2" }}>
                  {submitError}
                </span>
              ) : savedAt ? (
                <span className="field__hint">Збережено о {savedAt}</span>
              ) : null}
            </div>
          </form>
        ) : null}

        {activeTab === "wallets" ? (
          <div className="page">
            <div className="card card--nested">
              <div className="card__header">
                <div>
                  <h3 className="card__title">Ручне нарахування</h3>
                  <p className="card__subtitle">Нарахувати балі конкретному глядачу</p>
                </div>
              </div>

              <form className="form" onSubmit={handleAward}>
                <div className="form form--inline">
                  <label className="field">
                    <span className="field__label">Login (нік)</span>
                    <input
                      className="field__input"
                      value={award.userLogin}
                      onChange={(event) => setAwardValue("userLogin", event.target.value)}
                      placeholder="нік без @"
                      disabled={awarding}
                      required
                    />
                    <span className="field__hint">
                      Додається до наявного гаманця (новий не створюється)
                    </span>
                  </label>

                  <label className="field">
                    <span className="field__label">Сума</span>
                    <input
                      className="field__input"
                      type="number"
                      min={1}
                      value={award.amount}
                      onChange={(event) =>
                        setAwardValue("amount", Number(event.target.value) || 1)
                      }
                      disabled={awarding}
                    />
                  </label>
                </div>

                <label className="field">
                  <span className="field__label">Twitch user ID (необов'язково)</span>
                  <input
                    className="field__input"
                    value={award.twitchUserId}
                    onChange={(event) => setAwardValue("twitchUserId", event.target.value)}
                    placeholder="залиш порожнім — визначиться за ніком"
                    disabled={awarding}
                  />
                </label>

                <div className="actions">
                  <button className="button button--primary" type="submit" disabled={awarding}>
                    {awarding ? "Нарахування..." : "Нарахувати"}
                  </button>
                </div>
              </form>
            </div>

            <div className="card card--nested">
              <div className="card__header">
                <div>
                  <h3 className="card__title">Гаманці</h3>
                  <p className="card__subtitle">
                    Усього: {walletTotal}
                    {walletSearch.trim() ? " (за фільтром)" : ""}
                  </p>
                </div>

                <div className="actions">
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => void handlePurgeSim()}
                    disabled={walletsLoading}
                    title="Видалити старі симуляторні гаманці з бази"
                  >
                    Очистити sim
                  </button>
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => void loadWallets()}
                    disabled={walletsLoading}
                  >
                    Оновити
                  </button>
                </div>
              </div>

              <div className="field">
                <input
                  className="field__input"
                  type="search"
                  placeholder="Пошук за ніком або іменем…"
                  value={walletSearch}
                  onChange={(event) => {
                    setWalletPage(0);
                    setWalletSearch(event.target.value);
                  }}
                />
              </div>

              {error ? <div className="state-block state-block--error">{error}</div> : null}

              {wallets.length === 0 ? (
                <div className="state-block">
                  {walletsLoading ? "Завантаження…" : "Гаманців не знайдено"}
                </div>
              ) : (
                <>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>rank</th>
                          <th>viewer</th>
                          <th>balance</th>
                          <th>earnedTotal</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {wallets.map((wallet) => (
                          <tr key={wallet.id}>
                            <td>#{wallet.rank}</td>
                            <td>
                              <strong>{wallet.displayName || wallet.userLogin}</strong>
                              <span className="table-muted">@{wallet.userLogin}</span>
                            </td>
                            <td>
                              {wallet.balance} {unit}
                            </td>
                            <td>{wallet.earnedTotal}</td>
                            <td>
                              <button
                                className="button button--danger button--small"
                                type="button"
                                onClick={() => void handleDeleteWallet(wallet)}
                              >
                                Видалити
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="pagination">
                    <button
                      className="button button--ghost"
                      type="button"
                      onClick={() => setWalletPage((page) => Math.max(0, page - 1))}
                      disabled={walletsLoading || walletPage === 0}
                    >
                      ← Назад
                    </button>

                    <span className="pagination__info">
                      Сторінка {walletPage + 1} з{" "}
                      {Math.max(1, Math.ceil(walletTotal / WALLET_PAGE_SIZE))}
                    </span>

                    <button
                      className="button button--ghost"
                      type="button"
                      onClick={() => setWalletPage((page) => page + 1)}
                      disabled={
                        walletsLoading ||
                        (walletPage + 1) * WALLET_PAGE_SIZE >= walletTotal
                      }
                    >
                      Далі →
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
