import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync(
  new URL("../dashboard/src/App.jsx", import.meta.url),
  "utf8"
);

test("connect, status check and disconnect target the selected Telegram bot", () => {
  const selectedBotEndpointCalls = dashboard.match(
    /fetchApi\(\s*`\/api\/telegram\/webhook\/\$\{telegramBotSlug\}`/g
  ) || [];

  assert.equal(
    selectedBotEndpointCalls.length,
    4,
    "all webhook API calls must use telegramBotSlug"
  );

  assert.doesNotMatch(
    dashboard,
    /fetchApi\(\s*"\/api\/telegram\/webhook\/findly"/,
    "status checks must not be hardcoded to the Master Bot"
  );

  assert.doesNotMatch(
    dashboard,
    /fetchApi\(\s*"\/api\/telegram\/webhook\/findly"\s*,\s*\{\s*method:\s*"DELETE"/,
    "disconnect must not be hardcoded to the Master Bot"
  );
});
