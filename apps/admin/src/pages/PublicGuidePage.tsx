import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../components/auth/AuthContext";
import {
  generateCommandGuide,
  getCommandGuide,
  saveCommandGuide,
} from "../api/commandGuide";
import type { CommandGuide, GuideGroup } from "../types/commandGuide";

function cloneGroups(groups: GuideGroup[]): GuideGroup[] {
  return groups.map((group) => ({
    title: group.title,
    rows: group.rows.map((row) => ({ ...row })),
  }));
}

function move<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

export function PublicGuidePage() {
  const { user, login, logout, popupOpen, error: authError } = useAuth();
  const navigate = useNavigate();

  const [guide, setGuide] = useState<CommandGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<GuideGroup[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loginRequested, setLoginRequested] = useState(false);

  // After a login initiated from this page, jump into the admin dashboard.
  useEffect(() => {
    if (loginRequested && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [loginRequested, user, navigate]);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      setGuide(await getCommandGuide());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не вдалося завантажити довідник",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function startEditing() {
    setDraft(cloneGroups(guide?.groups ?? []));
    setSaveError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setDraft([]);
    setSaveError(null);
  }

  function updateGroupTitle(groupIndex: number, title: string) {
    setDraft((current) =>
      current.map((group, index) =>
        index === groupIndex ? { ...group, title } : group,
      ),
    );
  }

  function updateRow(
    groupIndex: number,
    rowIndex: number,
    key: "command" | "description",
    value: string,
  ) {
    setDraft((current) =>
      current.map((group, index) => {
        if (index !== groupIndex) {
          return group;
        }
        return {
          ...group,
          rows: group.rows.map((row, ri) =>
            ri === rowIndex ? { ...row, [key]: value } : row,
          ),
        };
      }),
    );
  }

  function addRow(groupIndex: number) {
    setDraft((current) =>
      current.map((group, index) =>
        index === groupIndex
          ? { ...group, rows: [...group.rows, { command: "", description: "" }] }
          : group,
      ),
    );
  }

  function deleteRow(groupIndex: number, rowIndex: number) {
    setDraft((current) =>
      current.map((group, index) =>
        index === groupIndex
          ? { ...group, rows: group.rows.filter((_, ri) => ri !== rowIndex) }
          : group,
      ),
    );
  }

  function moveRow(groupIndex: number, rowIndex: number, delta: number) {
    setDraft((current) =>
      current.map((group, index) =>
        index === groupIndex
          ? { ...group, rows: move(group.rows, rowIndex, delta) }
          : group,
      ),
    );
  }

  function addGroup() {
    setDraft((current) => [...current, { title: "Нова група", rows: [] }]);
  }

  function deleteGroup(groupIndex: number) {
    setDraft((current) => current.filter((_, index) => index !== groupIndex));
  }

  function moveGroup(groupIndex: number, delta: number) {
    setDraft((current) => move(current, groupIndex, delta));
  }

  async function handleGenerate() {
    const confirmed = window.confirm(
      "Перегенерувати довідник з поточних налаштувань? Поточні правки буде замінено.",
    );
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const result = await generateCommandGuide();
      setGuide(result);
      setDraft(cloneGroups(result.groups));
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Не вдалося перегенерувати",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);

    try {
      const cleaned = draft
        .map((group) => ({
          title: group.title.trim(),
          rows: group.rows
            .map((row) => ({
              command: row.command.trim(),
              description: row.description.trim(),
            }))
            .filter((row) => row.command || row.description),
        }))
        .filter((group) => group.title);

      const result = await saveCommandGuide(cleaned);
      setGuide(result);
      setEditing(false);
      setDraft([]);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Не вдалося зберегти довідник",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="public-shell">
      <header className="public-header">
        <div>
          <h1 className="page-title">Довідник команд</h1>
          <p className="page-subtitle">
            Усі команди бота й за що кожна відповідає
          </p>
        </div>

        <div className="public-header__actions">
          {user ? (
            <>
              <span className="badge badge--muted">{user.displayName}</span>
              <button
                className="button button--ghost"
                type="button"
                onClick={() => navigate("/dashboard")}
              >
                В адмінку
              </button>
              <button
                className="button button--ghost"
                type="button"
                onClick={() => {
                  void logout();
                }}
              >
                Вийти
              </button>
            </>
          ) : (
            <button
              className="button button--primary"
              type="button"
              onClick={() => {
                setLoginRequested(true);
                login();
              }}
              disabled={popupOpen}
            >
              {popupOpen ? "Очікування…" : "Увійти"}
            </button>
          )}
        </div>
      </header>

      <main className="public-content">
        {!user && authError ? (
          <div className="card state-block state-block--error">{authError}</div>
        ) : null}

        {loading ? <div className="card state-block">Завантаження…</div> : null}
        {error ? (
          <div className="card state-block state-block--error">{error}</div>
        ) : null}

        {!loading && !error && guide ? (
          <div className="card">
            <div className="card__header">
              <div>
                <h2 className="card__title">Команди</h2>
                <p className="card__subtitle">
                  {editing
                    ? "Режим редагування"
                    : user
                      ? "Натисни «Редагувати», щоб змінити довідник"
                      : "Список доступних команд"}
                </p>
              </div>

              {user ? (
                <div className="actions">
                  {editing ? (
                    <>
                      <button
                        className="button button--ghost"
                        type="button"
                        onClick={() => void handleGenerate()}
                        disabled={saving}
                      >
                        Згенерувати з налаштувань
                      </button>
                      <button
                        className="button button--primary"
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={saving}
                      >
                        {saving ? "Збереження…" : "Зберегти"}
                      </button>
                      <button
                        className="button button--ghost"
                        type="button"
                        onClick={cancelEditing}
                        disabled={saving}
                      >
                        Скасувати
                      </button>
                    </>
                  ) : (
                    <button
                      className="button button--primary"
                      type="button"
                      onClick={startEditing}
                    >
                      Редагувати
                    </button>
                  )}
                </div>
              ) : null}
            </div>

            {saveError ? (
              <div className="state-block state-block--error">{saveError}</div>
            ) : null}

            {editing ? (
              <GuideEditor
                draft={draft}
                saving={saving}
                onAddGroup={addGroup}
                onDeleteGroup={deleteGroup}
                onMoveGroup={moveGroup}
                onUpdateGroupTitle={updateGroupTitle}
                onAddRow={addRow}
                onDeleteRow={deleteRow}
                onMoveRow={moveRow}
                onUpdateRow={updateRow}
              />
            ) : (
              <GuideView groups={guide.groups} />
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}

function GuideView({ groups }: { groups: GuideGroup[] }) {
  if (groups.length === 0) {
    return <div className="state-block">Довідник поки порожній</div>;
  }

  return (
    <>
      {groups.map((group) => (
        <div className="command-ref__group" key={group.title}>
          <h3 className="command-ref__group-title">{group.title}</h3>
          <div className="table-wrap">
            <table className="data-table">
              <tbody>
                {group.rows.map((row, index) => (
                  <tr key={`${group.title}-${index}`}>
                    <td>
                      <span className="badge badge--muted">{row.command}</span>
                    </td>
                    <td>{row.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}

type GuideEditorProps = {
  draft: GuideGroup[];
  saving: boolean;
  onAddGroup: () => void;
  onDeleteGroup: (groupIndex: number) => void;
  onMoveGroup: (groupIndex: number, delta: number) => void;
  onUpdateGroupTitle: (groupIndex: number, title: string) => void;
  onAddRow: (groupIndex: number) => void;
  onDeleteRow: (groupIndex: number, rowIndex: number) => void;
  onMoveRow: (groupIndex: number, rowIndex: number, delta: number) => void;
  onUpdateRow: (
    groupIndex: number,
    rowIndex: number,
    key: "command" | "description",
    value: string,
  ) => void;
};

function GuideEditor({
  draft,
  saving,
  onAddGroup,
  onDeleteGroup,
  onMoveGroup,
  onUpdateGroupTitle,
  onAddRow,
  onDeleteRow,
  onMoveRow,
  onUpdateRow,
}: GuideEditorProps) {
  return (
    <div className="guide-editor">
      {draft.map((group, groupIndex) => (
        <div className="card card--nested" key={groupIndex}>
          <div className="card__header">
            <label className="field" style={{ flex: 1 }}>
              <span className="field__label">Назва групи</span>
              <input
                className="field__input"
                type="text"
                value={group.title}
                onChange={(event) =>
                  onUpdateGroupTitle(groupIndex, event.target.value)
                }
                disabled={saving}
              />
            </label>

            <div className="actions">
              <button
                className="button button--ghost"
                type="button"
                onClick={() => onMoveGroup(groupIndex, -1)}
                disabled={saving || groupIndex === 0}
                title="Вгору"
              >
                ↑
              </button>
              <button
                className="button button--ghost"
                type="button"
                onClick={() => onMoveGroup(groupIndex, 1)}
                disabled={saving || groupIndex === draft.length - 1}
                title="Вниз"
              >
                ↓
              </button>
              <button
                className="button button--danger"
                type="button"
                onClick={() => onDeleteGroup(groupIndex)}
                disabled={saving}
              >
                Видалити групу
              </button>
            </div>
          </div>

          {group.rows.map((row, rowIndex) => (
            <div className="guide-editor__row" key={rowIndex}>
              <label className="field">
                <span className="field__label">Команда</span>
                <input
                  className="field__input"
                  type="text"
                  value={row.command}
                  onChange={(event) =>
                    onUpdateRow(groupIndex, rowIndex, "command", event.target.value)
                  }
                  placeholder="!команда"
                  disabled={saving}
                />
              </label>

              <label className="field">
                <span className="field__label">Опис</span>
                <textarea
                  className="field__input field__input--textarea"
                  value={row.description}
                  onChange={(event) =>
                    onUpdateRow(
                      groupIndex,
                      rowIndex,
                      "description",
                      event.target.value,
                    )
                  }
                  rows={2}
                  disabled={saving}
                />
              </label>

              <div className="actions">
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => onMoveRow(groupIndex, rowIndex, -1)}
                  disabled={saving || rowIndex === 0}
                  title="Вгору"
                >
                  ↑
                </button>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => onMoveRow(groupIndex, rowIndex, 1)}
                  disabled={saving || rowIndex === group.rows.length - 1}
                  title="Вниз"
                >
                  ↓
                </button>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => onDeleteRow(groupIndex, rowIndex)}
                  disabled={saving}
                >
                  Видалити
                </button>
              </div>
            </div>
          ))}

          <div className="actions">
            <button
              className="button button--ghost"
              type="button"
              onClick={() => onAddRow(groupIndex)}
              disabled={saving}
            >
              + Команда
            </button>
          </div>
        </div>
      ))}

      <div className="actions">
        <button
          className="button button--ghost"
          type="button"
          onClick={onAddGroup}
          disabled={saving}
        >
          + Група
        </button>
      </div>
    </div>
  );
}
