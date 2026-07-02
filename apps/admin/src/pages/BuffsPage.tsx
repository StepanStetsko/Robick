import { useEffect, useState, type FormEvent } from "react";
import {
  createBuffDefinition,
  deleteBuffDefinition,
  getBuffDefinitions,
  getBuffSettings,
  updateBuffDefinition,
  updateBuffSettings,
} from "../api/buffs";
import type {
  BuffDefinition,
  BuffDurationMode,
  BuffEffectType,
  BuffKind,
  BuffMessages,
  BuffSettings,
  BuffTarget,
  SaveBuffDefinitionDto,
} from "../types/buffs";

const curseMessageFields: { key: keyof BuffMessages; label: string; hint: string }[] = [
  { key: "cursed", label: "Наклав прокляття", hint: "{casterName}, {victimName}, {title}, {effect}" },
  { key: "noTarget", label: "Нема кого проклясти", hint: "{casterName}" },
  { key: "self", label: "Себе не можна", hint: "{casterName}" },
  { key: "shielded", label: "Ціль під щитом", hint: "{casterName}, {victimName}" },
  { key: "cooldown", label: "Кулдаун", hint: "{casterName}, {secondsLeft}" },
  { key: "insufficient", label: "Недостатньо балів", hint: "{casterName}, {cost}, {balance}, {unit}" },
  { key: "noDebuffs", label: "Немає дебафів", hint: "{casterName}" },
];

type FormState = {
  key: string;
  title: string;
  description: string;
  kind: BuffKind;
  effectType: BuffEffectType;
  magnitude: number;
  durationMode: BuffDurationMode;
  durationValue: number;
  cost: number;
  target: BuffTarget;
  enabled: boolean;
};

const emptyForm: FormState = {
  key: "",
  title: "",
  description: "",
  kind: "buff",
  effectType: "chance",
  magnitude: 25,
  durationMode: "time",
  durationValue: 10,
  cost: 100,
  target: "self",
  enabled: true,
};

const effectHints: Record<BuffEffectType, string> = {
  chance:
    "Зсув ШАНСУ успіху у відсоткових пунктах. +25 = +25% до шансу вдалого ролу/виграшу, -25 = навпаки. Діє на: фан-метр, рулетку, бійку, крадіжку.",
  multiplier:
    "Множник на НАРАХОВАНІ очки. 200 = ×2 (вдвічі більше), 50 = ×0.5, 0 = нічого. Діє на: пасивний заробіток (чат+присутність), виплату рулетки, нагороду «вгадай число».",
  flat:
    "Плоский бонус, що додається до результату ролу. Діє лише на фан-метр (напр. !удача).",
  guarantee:
    "Гарантує НАПРЯМОК ролу фан-метра: значення ≥0 — завжди в плюс, <0 — завжди в мінус. Тільки фан-метр.",
  no_earn:
    "Повністю ЗУПИНЯЄ пасивний заробіток (чат + присутність), поки діє. Ігри, виграші й !бонус не чіпає. Поле «сила» тут не потрібне.",
};

export function BuffsPage() {
  const [buffs, setBuffs] = useState<BuffDefinition[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [curse, setCurse] = useState<BuffSettings | null>(null);
  const [curseSaving, setCurseSaving] = useState(false);
  const [curseError, setCurseError] = useState<string | null>(null);
  const [curseSavedAt, setCurseSavedAt] = useState<string | null>(null);

  async function loadBuffs() {
    setError(null);

    try {
      setBuffs(await getBuffDefinitions());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося завантажити бафи");
    } finally {
      setLoading(false);
    }
  }

  async function loadCurse() {
    try {
      setCurse(await getBuffSettings());
    } catch {
      // non-critical
    }
  }

  useEffect(() => {
    void loadBuffs();
    void loadCurse();
  }, []);

  async function handleSaveCurse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!curse) {
      return;
    }

    setCurseSaving(true);
    setCurseError(null);
    setCurseSavedAt(null);

    try {
      const updated = await updateBuffSettings({
        curseCommand: curse.curseCommand,
        curseCooldownSec: curse.curseCooldownSec,
        curseCost: curse.curseCost,
        messages: curse.messages,
      });
      setCurse(updated);
      setCurseSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setCurseError(err instanceof Error ? err.message : "Не вдалося зберегти");
    } finally {
      setCurseSaving(false);
    }
  }

  function setCurseValue<K extends keyof BuffSettings>(
    key: K,
    value: BuffSettings[K],
  ) {
    setCurse((current) => (current ? { ...current, [key]: value } : current));
  }

  function setCurseMessage(key: keyof BuffMessages, value: string) {
    setCurse((current) =>
      current
        ? { ...current, messages: { ...current.messages, [key]: value } }
        : current,
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSubmitError(null);

    try {
      const payload: SaveBuffDefinitionDto = { ...form };

      if (editingKey) {
        await updateBuffDefinition(editingKey, payload);
      } else {
        await createBuffDefinition(payload);
      }

      resetForm();
      await loadBuffs();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Не вдалося зберегти баф");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(buff: BuffDefinition) {
    if (!window.confirm(`Видалити баф «${buff.title}»?`)) {
      return;
    }

    setError(null);

    try {
      await deleteBuffDefinition(buff.key);
      if (editingKey === buff.key) {
        resetForm();
      }
      await loadBuffs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося видалити баф");
    }
  }

  function startEdit(buff: BuffDefinition) {
    setEditingKey(buff.key);
    setForm({
      key: buff.key,
      title: buff.title,
      description: buff.description,
      kind: buff.kind,
      effectType: buff.effectType,
      magnitude: buff.magnitude,
      durationMode: buff.durationMode,
      durationValue: buff.durationValue,
      cost: buff.cost,
      target: buff.target,
      enabled: buff.enabled,
    });
    setSubmitError(null);
  }

  function resetForm() {
    setEditingKey(null);
    setForm(emptyForm);
    setSubmitError(null);
  }

  function setFormValue<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="page">
      <div className="page-columns page-columns--align-start">
        <div className="card">
          <div className="card__header">
            <div>
              <h2 className="card__title">
                {editingKey ? `Редагування ${editingKey}` : "Новий баф"}
              </h2>
              <p className="card__subtitle">Ефект, тривалість, ціна</p>
            </div>
          </div>

          <p className="tab-panel__intro">
            Бафи та дебафи — тимчасові ефекти, які глядач ловить рулеткою{" "}
            <strong>!ефект</strong> (випадковий баф або дебаф за ціну з «Економіки»).
            Тип ефекту визначає, <em>що</em> він робить і <em>де</em> діє — див.
            підказку під полем «Тип ефекту».
          </p>

          {submitError ? (
            <div className="state-block state-block--error">{submitError}</div>
          ) : null}

          <form className="form" onSubmit={handleSubmit}>
            <label className="field">
              <span className="field__label">Ключ</span>
              <input
                className="field__input"
                value={form.key}
                onChange={(event) => setFormValue("key", event.target.value)}
                placeholder="lucky"
                disabled={saving || Boolean(editingKey)}
                required
              />
              <span className="field__hint">lowercase latin, numbers, underscore</span>
            </label>

            <label className="field">
              <span className="field__label">Назва</span>
              <input
                className="field__input"
                value={form.title}
                onChange={(event) => setFormValue("title", event.target.value)}
                placeholder="Щасливчик"
                disabled={saving}
                required
              />
            </label>

            <label className="field">
              <span className="field__label">Опис</span>
              <input
                className="field__input"
                value={form.description}
                onChange={(event) => setFormValue("description", event.target.value)}
                disabled={saving}
              />
            </label>

            <label className="field">
              <span className="field__label">Категорія</span>
              <select
                className="field__input"
                value={form.kind}
                onChange={(event) =>
                  setFormValue("kind", event.target.value as BuffKind)
                }
                disabled={saving}
              >
                <option value="buff">баф (позитивний)</option>
                <option value="debuff">дебаф (негативний)</option>
              </select>
              <span className="field__hint">
                Визначає, у який пул потрапляє ефект для рулетки
              </span>
            </label>

            <label className="field">
              <span className="field__label">Тип ефекту</span>
              <select
                className="field__input"
                value={form.effectType}
                onChange={(event) =>
                  setFormValue("effectType", event.target.value as BuffEffectType)
                }
                disabled={saving}
              >
                <option value="chance">chance — зсув шансу</option>
                <option value="multiplier">multiplier — множник очок</option>
                <option value="flat">flat — плоский бонус (фан-метр)</option>
                <option value="guarantee">guarantee — гарантія напрямку (фан-метр)</option>
                <option value="no_earn">no_earn — стоп-заробіток</option>
              </select>
              <span className="field__hint">{effectHints[form.effectType]}</span>
            </label>

            <label className="field">
              <span className="field__label">Сила ефекту (magnitude)</span>
              <input
                className="field__input"
                type="number"
                value={form.magnitude}
                onChange={(event) =>
                  setFormValue("magnitude", Number(event.target.value) || 0)
                }
                disabled={saving || form.effectType === "no_earn"}
              />
              <span className="field__hint">
                {form.effectType === "no_earn"
                  ? "Для стоп-заробітку значення не потрібне"
                  : form.effectType === "multiplier"
                    ? "у відсотках: 200 = ×2, 50 = ×0.5, 0 = нічого"
                    : form.effectType === "chance"
                      ? "відсоткові пункти: +25 або -25"
                      : "число (для guarantee важливий лише знак: + чи −)"}
              </span>
            </label>

            <div className="form form--inline">
              <label className="field">
                <span className="field__label">Режим тривалості</span>
                <select
                  className="field__input"
                  value={form.durationMode}
                  onChange={(event) =>
                    setFormValue("durationMode", event.target.value as BuffDurationMode)
                  }
                  disabled={saving}
                >
                  <option value="time">За часом (хв)</option>
                  <option value="rolls">За кількістю роллів</option>
                </select>
              </label>

              <label className="field">
                <span className="field__label">
                  {form.durationMode === "time" ? "Хвилин" : "Роллів"}
                </span>
                <input
                  className="field__input"
                  type="number"
                  min={1}
                  value={form.durationValue}
                  onChange={(event) =>
                    setFormValue("durationValue", Number(event.target.value) || 1)
                  }
                  disabled={saving}
                />
              </label>
            </div>

            <label className="field field--checkbox">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setFormValue("enabled", event.target.checked)}
                disabled={saving}
              />
              <span>Увімкнено</span>
            </label>

            <div className="actions">
              <button className="button button--primary" type="submit" disabled={saving}>
                {saving ? "Збереження..." : editingKey ? "Оновити" : "Створити"}
              </button>

              {editingKey ? (
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                >
                  Скасувати
                </button>
              ) : null}
            </div>
          </form>
        </div>

        <div className="card">
          <div className="card__header">
            <div>
              <h2 className="card__title">Бафи</h2>
              <p className="card__subtitle">Каталог бафів і дебафів</p>
            </div>
          </div>

          {loading ? <div className="state-block">Завантаження...</div> : null}
          {error ? <div className="state-block state-block--error">{error}</div> : null}

          <div className="events-list">
            {buffs.map((buff) => (
              <article className="event-card" key={buff.key}>
                <div className="event-card__top">
                  <div>
                    <strong>{buff.title}</strong>
                    <span className="table-muted">{buff.key}</span>
                    <span className="table-muted">
                      {buff.kind === "debuff" ? "дебаф" : "баф"} ·{" "}
                      {buff.effectType} · {buff.magnitude} ·{" "}
                      {buff.durationMode === "time"
                        ? `${buff.durationValue} хв`
                        : `${buff.durationValue} роллів`}
                    </span>
                  </div>
                  <span
                    className={`badge ${
                      buff.enabled ? "badge--success" : "badge--warning"
                    }`}
                  >
                    {buff.enabled ? "on" : "off"}
                  </span>
                </div>

                <div className="actions">
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => startEdit(buff)}
                  >
                    Редагувати
                  </button>
                  <button
                    className="button button--danger"
                    type="button"
                    onClick={() => void handleDelete(buff)}
                  >
                    Видалити
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      {curse ? (
        <div className="card">
          <div className="card__header">
            <div>
              <h2 className="card__title">Прокляття (дебаф на іншого)</h2>
              <p className="card__subtitle">
                Команда, якою глядач наводить випадковий дебаф на когось
              </p>
            </div>
          </div>

          <p className="tab-panel__intro">
            <strong>!{curse.curseCommand}</strong> — випадкова ціль серед
            присутніх; <strong>!{curse.curseCommand} @нік</strong> — конкретна.
            Доступно всім. Щит захищає ціль (як від крадіжки). Накладає
            випадковий <em>дебаф</em> із каталогу вище.
          </p>

          <form className="form" onSubmit={handleSaveCurse}>
            <div className="form form--inline">
              <label className="field">
                <span className="field__label">Команда прокляття</span>
                <input
                  className="field__input"
                  value={curse.curseCommand}
                  onChange={(event) =>
                    setCurseValue("curseCommand", event.target.value)
                  }
                  disabled={curseSaving}
                  required
                />
                <span className="field__hint">без «!»</span>
              </label>

              <label className="field">
                <span className="field__label">Кулдаун на юзера (с)</span>
                <input
                  className="field__input"
                  type="number"
                  min={0}
                  value={curse.curseCooldownSec}
                  onChange={(event) =>
                    setCurseValue(
                      "curseCooldownSec",
                      Number(event.target.value) || 0,
                    )
                  }
                  disabled={curseSaving}
                />
              </label>

              <label className="field">
                <span className="field__label">Ціна (у балах)</span>
                <input
                  className="field__input"
                  type="number"
                  min={0}
                  value={curse.curseCost}
                  onChange={(event) =>
                    setCurseValue("curseCost", Number(event.target.value) || 0)
                  }
                  disabled={curseSaving}
                />
                <span className="field__hint">0 = безкоштовно</span>
              </label>
            </div>

            <h3 className="command-ref__group-title">Повідомлення</h3>
            {curseMessageFields.map((meta) => (
              <label className="field" key={meta.key}>
                <span className="field__label">{meta.label}</span>
                <textarea
                  className="field__input field__input--textarea"
                  rows={2}
                  value={curse.messages[meta.key]}
                  onChange={(event) =>
                    setCurseMessage(meta.key, event.target.value)
                  }
                  disabled={curseSaving}
                />
                <span className="field__hint">{meta.hint}</span>
              </label>
            ))}

            <div className="form__footer">
              <button
                className="button button--primary"
                type="submit"
                disabled={curseSaving}
              >
                {curseSaving ? "Збереження..." : "Зберегти"}
              </button>
              {curseError ? (
                <span className="field__hint" style={{ color: "#ffb5b2" }}>
                  {curseError}
                </span>
              ) : curseSavedAt ? (
                <span className="field__hint">Збережено о {curseSavedAt}</span>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
