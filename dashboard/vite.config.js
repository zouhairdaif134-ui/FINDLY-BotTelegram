import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const telegramSection = `
function TelegramSection({
  status,
  loading,
  message,
  error,
  onConnect,
  onDisconnect
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Telegram Webhook</h2>
          <p>Connect the FINDLY Master Bot to the production Worker.</p>
        </div>
        <span className={status === "Connected" ? "active-label" : "inactive-label"}>
          {status}
        </span>
      </div>

      <div className="management-toolbar">
        <div>
          <strong>Master Bot</strong>
          <span>@FindlySearch2026Bot</span>
        </div>

        <div className="header-actions">
          <button className="primary-button" type="button" onClick={onConnect} disabled={loading}>
            {loading ? "Connecting..." : "Connect Webhook"}
          </button>
          <button className="secondary-button" type="button" onClick={onDisconnect} disabled={loading}>
            Disconnect
          </button>
        </div>
      </div>

      {message && <div className="auth-success">{message}</div>}
      {error && <div className="auth-error">{error}</div>}

      <div className="panel" style={{ marginTop: "16px" }}>
        <strong>Production Worker</strong>
        <p>https://findly-v3-api.berrchidcity99.workers.dev</p>
        <small>The webhook endpoint is configured by the FINDLY API.</small>
      </div>
    </section>
  );
}
`;

export default defineConfig({
  plugins: [
    react(),
    {
      name: "findly-telegram-dashboard-repair",
      transform(code, id) {
        if (!id.endsWith("/dashboard/src/App.jsx")) {
          return null;
        }

        if (code.includes("function TelegramSection({")) {
          return null;
        }

        const marker = "function getSectionDescription(\n";
        if (!code.includes(marker)) {
          throw new Error("FINDLY Telegram repair marker not found in App.jsx");
        }

        return {
          code: code.replace(marker, `${telegramSection}\n${marker}`),
          map: null
        };
      }
    }
  ]
});
