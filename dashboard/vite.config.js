import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const telegramRepairPlugin = {
  name: "findly-telegram-dashboard-repair",
  transform(code, id) {
    if (!id.endsWith("/dashboard/src/App.jsx")) {
      return null;
    }

    if (!code.includes("function TelegramSection({")) {
      throw new Error("FINDLY TelegramSection is missing from App.jsx");
    }

    const connectMarker = "    async function connectTelegramWebhook() {";
    const disconnectMarker = "async function disconnectTelegramWebhook() {";
    const resultMarker = "    const result =\n      await response.json().catch(";

    const connectStart = code.indexOf(connectMarker);
    const disconnectStart = code.indexOf(disconnectMarker, connectStart);
    const resultStart = code.indexOf(resultMarker, disconnectStart);

    if (
      connectStart !== -1 &&
      disconnectStart !== -1 &&
      resultStart !== -1
    ) {
      const connectBlock = code.slice(
        connectStart,
        disconnectStart
      );
      const disconnectBlock = code.slice(
        disconnectStart,
        resultStart
      );

      code =
        code.slice(0, connectStart) +
        code.slice(resultStart);

      const fetchMarker = "  async function fetchApi(\n";
      const fetchStart = code.indexOf(fetchMarker);

      if (fetchStart === -1) {
        throw new Error(
          "FINDLY fetchApi repair marker not found"
        );
      }

      code =
        code.slice(0, fetchStart) +
        connectBlock +
        "\n\n" +
        disconnectBlock +
        "\n\n" +
        code.slice(fetchStart);
    }

    return {
      code,
      map: null
    };
  }
};

export default defineConfig({
  plugins: [
    telegramRepairPlugin,
    react()
  ]
});
