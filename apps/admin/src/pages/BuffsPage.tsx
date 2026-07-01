import { useEffect, useState, type FormEvent } from "react";
import {
  createBuffDefinition,
  deleteBuffDefinition,
  getBuffDefinitions,
  updateBuffDefinition,
} from "../api/buffs";
import type {
  BuffDefinition,
  BuffDurationMode,
  BuffEffectType,
  BuffKind,
  BuffTarget,
  SaveBuffDefinitionDto,
} from "../types/buffs";

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
  chance: "Зсув шансу на + (відсоткові пункти, напр. 25 = +25%, -25 = дебаф)",
  multiplier: "Множник приросту у % (200 = ×2, 50 = половина)",
  flat: "Плоский бонус до приросту (одиниці)",
  guarantee: "≥0 — гарантований плюс, <0 — гарантований мінус",
};

export function BuffsPage() {
  const [buffs, setBuffs] = useState<BuffDefinition[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  useEffect(() => {
    void loadBuffs();
  }, []);

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
                <option value="multiplier">multiplier — множник</option>
                <option value="flat">flat — плоский бонус</option>
                <option value="guarantee">guarantee — гарантія напрямку</option>
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
                disabled={saving}
              />
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

            <div className="form form--inline">
              <label className="field">
                <span className="field__label">Ціна (не використовується)</span>
                <input
                  className="field__input"
                  type="number"
                  min={0}
                  value={form.cost}
                  onChange={(event) =>
                    setFormValue("cost", Number(event.target.value) || 0)
                  }
                  disabled={saving}
                />
                <span className="field__hint">
                  Ціна рулетки спільна — задається в «Економіка»
                </span>
              </label>

              <label className="field">
                <span className="field__label">Ціль</span>
                <select
                  className="field__input"
                  value={form.target}
                  onChange={(event) =>
                    setFormValue("target", event.target.value as BuffTarget)
                  }
                  disabled={saving}
                >
                  <option value="self">self — собі</option>
                  <option value="other">other — іншому</option>
                </select>
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
    </div>
  );
}
