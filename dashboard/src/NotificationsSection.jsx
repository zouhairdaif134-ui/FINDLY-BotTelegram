import { useEffect, useState } from "react";

const EMPTY_FORM = {
  user_id: "",
  bot_id: "",
  subscription_type: "general",
  filters: "{}",
  is_active: true
};

export default function NotificationsSection({
  fetchApi,
  bots,
  users
}) {
  const [notifications, setNotifications] = useState([]);
  const [form, setForm] = useState({
    ...EMPTY_FORM
  });
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadNotifications() {
    try {
      setLoading(true);
      setError("");

      const data = await fetchApi("/api/notifications");
      setNotifications(data || []);
    } catch (err) {
      console.error(err);
      setError(
        err.message || "Failed to load notifications."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      bot_id: bots[0]?.id || "",
      user_id: users[0]?.id || ""
    });
    setError("");
  }

  function openEdit(item) {
    setEditing(item.id);
    setForm({
      user_id: item.user_id || "",
      bot_id: item.bot_id || "",
      subscription_type:
        item.subscription_type || "general",
      filters: JSON.stringify(
        item.filters || {},
        null,
        2
      ),
      is_active: item.is_active !== false
    });
    setError("");
  }

  function cancelEdit() {
    setEditing(null);
    setForm({
      ...EMPTY_FORM
    });
    setError("");
  }

  async function saveNotification(event) {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");

      if (!form.user_id || !form.bot_id) {
        throw new Error(
          "User and bot are required."
        );
      }

      let filters = {};
      try {
        filters = JSON.parse(
          form.filters || "{}"
        );
      } catch {
        throw new Error(
          "Filters must contain valid JSON."
        );
      }

      const payload = {
        user_id: form.user_id,
        bot_id: form.bot_id,
        subscription_type:
          form.subscription_type.trim(),
        filters,
        is_active: form.is_active
      };

      if (!payload.subscription_type) {
        throw new Error(
          "Subscription type is required."
        );
      }

      if (editing) {
        await fetchApi(
          `/api/notifications/${editing}`,
          {
            method: "PUT",
            body: JSON.stringify({
              subscription_type:
                payload.subscription_type,
              filters: payload.filters,
              is_active:
                payload.is_active
            })
          }
        );
      } else {
        await fetchApi(
          "/api/notifications",
          {
            method: "POST",
            body: JSON.stringify(payload)
          }
        );
      }

      cancelEdit();
      await loadNotifications();
    } catch (err) {
      console.error(err);
      setError(
        err.message || "Unable to save notification."
      );
    } finally {
      setSaving(false);
    }
  }

  async function archiveNotification(id) {
    try {
      setError("");

      await fetchApi(
        `/api/notifications/${id}`,
        {
          method: "DELETE"
        }
      );

      await loadNotifications();
    } catch (err) {
      console.error(err);
      setError(
        err.message || "Unable to archive notification."
      );
    }
  }

  function getBotName(id) {
    return (
      bots.find((bot) => bot.id === id)?.name ||
      "Unknown bot"
    );
  }

  function getUserName(id) {
    const user = users.find(
      (item) => item.id === id
    );

    if (!user) {
      return "Unknown user";
    }

    return (
      user.username ||
      user.first_name ||
      user.telegram_username ||
      user.telegram_user_id ||
      user.id
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Notifications</h2>
          <p>
            Manage notification subscriptions for FINDLY users and bots.
          </p>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={openCreate}
          disabled={saving}
        >
          + New Subscription
        </button>
      </div>

      {error && (
        <div className="auth-error">
          {error}
        </div>
      )}

      {editing !== null || form.bot_id || form.user_id ? (
        <form
          className="modal-form"
          onSubmit={saveNotification}
        >
          <div className="form-grid">
            <div className="auth-field">
              <label>User</label>
              <select
                value={form.user_id}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    user_id: event.target.value
                  }))
                }
                required
                disabled={editing !== null}
              >
                <option value="">
                  Select user
                </option>
                {users.map((user) => (
                  <option
                    key={user.id}
                    value={user.id}
                  >
                    {getUserName(user.id)}
                  </option>
                ))}
              </select>
            </div>

            <div className="auth-field">
              <label>Bot</label>
              <select
                value={form.bot_id}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    bot_id: event.target.value
                  }))
                }
                required
                disabled={editing !== null}
              >
                <option value="">
                  Select bot
                </option>
                {bots.map((bot) => (
                  <option
                    key={bot.id}
                    value={bot.id}
                  >
                    {bot.name}
                  </option>
                ))}
              </select>
            </div>

            <FormField
              label="Subscription Type"
              value={form.subscription_type}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  subscription_type: value
                }))
              }
              placeholder="general"
              required
            />

            <FormField
              label="Filters JSON"
              value={form.filters}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  filters: value
                }))
              }
              placeholder='{"category":"news"}'
              textarea
            />
          </div>

          <CheckboxField
            checked={form.is_active}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                is_active: value
              }))
            }
            label="Subscription is active"
          />

          <div className="modal-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={cancelEdit}
              disabled={saving}
            >
              Cancel
            </button>

            <button
              className="primary-button"
              type="submit"
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : editing
                ? "Save Changes"
                : "Create Subscription"}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <div className="empty-state">
          Loading notifications...
        </div>
      ) : notifications.length === 0 ? (
        <div className="empty-state">
          No notification subscriptions yet.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Bot</th>
                <th>Type</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {notifications.map((item) => (
                <tr key={item.id}>
                  <td>{getUserName(item.user_id)}</td>
                  <td>{getBotName(item.bot_id)}</td>
                  <td>{item.subscription_type}</td>
                  <td>
                    <StatusBadge
                      active={item.is_active}
                    />
                  </td>
                  <td>
                    {formatDate(item.created_at)}
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => openEdit(item)}
                      >
                        Edit
                      </button>
                      {item.is_active && (
                        <button
                          className="danger-button"
                          type="button"
                          onClick={() =>
                            archiveNotification(
                              item.id
                            )
                          }
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  textarea = false
}) {
  return (
    <div className="auth-field">
      <label>{label}</label>
      {textarea ? (
        <textarea
          value={value ?? ""}
          onChange={(event) =>
            onChange(event.target.value)
          }
          placeholder={placeholder}
          rows={5}
          required={required}
        />
      ) : (
        <input
          value={value ?? ""}
          onChange={(event) =>
            onChange(event.target.value)
          }
          placeholder={placeholder}
          required={required}
        />
      )}
    </div>
  );
}

function CheckboxField({
  checked,
  onChange,
  label
}) {
  return (
    <label className="checkbox-field">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) =>
          onChange(event.target.checked)
        }
      />
      <span>{label}</span>
    </label>
  );
}

function StatusBadge({ active }) {
  return (
    <div
      className={
        "status " +
        (active ? "online" : "offline")
      }
    >
      <span />
      {active ? "Active" : "Paused"}
    </div>
  );
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString();
}
