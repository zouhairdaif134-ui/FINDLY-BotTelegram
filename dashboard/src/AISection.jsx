import { useEffect, useState } from "react";
import "./ai-section.css";

const DEFAULT_CONFIG = {
  enabled: false,
  model: "@cf/qwen/qwen3.8-27b",
  system_prompt: "You are a helpful assistant for FINDLY. Answer clearly and briefly.",
  temperature: 0.7,
  max_tokens: 700,
  timeout_ms: 15000
};

export default function AISection({ fetchApi, bots = [] }) {
  const [botId, setBotId] = useState(bots[0]?.id || "");
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [providerConfigured, setProviderConfigured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!botId && bots[0]?.id) setBotId(bots[0].id);
  }, [bots, botId]);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!botId) return;
      setLoading(true);
      setError("");
      setNotice("");
      try {
        const result = await fetchApi("/api/ai/config?bot_id=" + encodeURIComponent(botId));
        if (!active) return;
        setConfig({ ...DEFAULT_CONFIG, ...(result?.config || {}) });
        setProviderConfigured(Boolean(result?.provider_configured));
      } catch (err) {
        if (active) setError(err?.message || "Unable to load AI configuration.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [botId]);

  function update(field, value) {
    setConfig((current) => ({ ...current, [field]: value }));
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await fetchApi("/api/ai/config", {
        method: "PUT",
        body: JSON.stringify({ bot_id: botId, config })
      });
      setConfig({ ...DEFAULT_CONFIG, ...(result?.config || {}) });
      setProviderConfigured(Boolean(result?.provider_configured));
      setNotice("AI configuration saved. AI remains off unless you enable it.");
    } catch (err) {
      setError(err?.message || "Unable to save AI configuration.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="ai-admin">
      <div className="ai-admin__header">
        <div>
          <p className="ai-admin__eyebrow">FINDLY INTELLIGENCE</p>
          <h2>AI Configuration</h2>
          <p>Configure the assistant separately for each Telegram bot.</p>
        </div>
        <span className={config.enabled ? "ai-status ai-status--on" : "ai-status"}>
          {config.enabled ? "Enabled for selected bot" : "Disabled"}
        </span>
      </div>

      <div className="ai-admin__notice">
        <strong>Cloudflare Workers AI is the configured provider.</strong>
        <span> Inference uses the Worker AI binding; no third-party API key is required.</span>
      </div>

      {error && <div className="ai-admin__alert ai-admin__alert--error">{error}</div>}
      {notice && <div className="ai-admin__alert ai-admin__alert--success">{notice}</div>}

      <form onSubmit={save}>
        <div className="ai-admin__card">
          <div className="ai-admin__card-heading">
            <div><h3>Bot configuration</h3><p>These values apply only to the selected bot.</p></div>
            <label className="ai-admin__toggle">
              <input type="checkbox" checked={Boolean(config.enabled)} onChange={(e) => update("enabled", e.target.checked)} />
              <span>Enable AI</span>
            </label>
          </div>

          <label className="ai-admin__field">
            <span>Telegram bot</span>
            <select value={botId} onChange={(e) => setBotId(e.target.value)} disabled={loading || saving}>
              {bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name} · @{String(bot.telegram_username || bot.slug).replace(/^@/, "")}</option>)}
            </select>
          </label>

          <label className="ai-admin__field">
            <span>Workers AI model</span>
            <input value={config.model} maxLength={100} onChange={(e) => update("model", e.target.value)} required />
            <small>Default: @cf/qwen/qwen3.8-27b</small>
          </label>

          <label className="ai-admin__field">
            <span>System prompt</span>
            <textarea value={config.system_prompt} maxLength={2000} rows={5} onChange={(e) => update("system_prompt", e.target.value)} />
            <small>Maximum 2,000 characters.</small>
          </label>

          <div className="ai-admin__grid ai-admin__grid--three">
            <label className="ai-admin__field">
              <span>Temperature · {config.temperature}</span>
              <input type="number" min="0" max="2" step="0.1" value={config.temperature} onChange={(e) => update("temperature", Number(e.target.value))} />
            </label>
            <label className="ai-admin__field">
              <span>Maximum output tokens</span>
              <input type="number" min="1" max="2000" value={config.max_tokens} onChange={(e) => update("max_tokens", Number(e.target.value))} />
            </label>
            <label className="ai-admin__field">
              <span>Timeout · milliseconds</span>
              <input type="number" min="1000" max="30000" step="500" value={config.timeout_ms} onChange={(e) => update("timeout_ms", Number(e.target.value))} />
            </label>
          </div>

          <div className="ai-admin__provider">
            <span className={providerConfigured ? "ai-provider-dot ai-provider-dot--ready" : "ai-provider-dot"} />
            <div><strong>{providerConfigured ? "Workers AI binding detected" : "Workers AI binding unavailable"}</strong><small>{providerConfigured ? "AI can use Cloudflare inference when enabled." : "The Worker AI binding must be added before enabling AI."}</small></div>
          </div>

          <div className="ai-admin__actions">
            <button type="submit" disabled={saving || loading || !botId}>{saving ? "Saving…" : "Save configuration"}</button>
            <span>AI is disabled by default for every bot.</span>
          </div>
        </div>
      </form>
    </section>
  );
}
