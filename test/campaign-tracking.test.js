import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("campaign redirect is routed through the Worker before the SPA fallback", async () => {
  const route = await read("../src/index.js");
  const config = await read("../wrangler.jsonc");
  assert.match(route, /handleCampaignRedirect/);
  assert.match(config, /"\/go\/\*"/);
});

test("campaign redirect generates a bounded Telegram start token and excludes crawler traffic", async () => {
  const route = await read("../src/index.js");
  assert.match(route, /\/go\//);
  assert.match(route, /campaign_visit/);
  assert.match(route, /visitor_hash/);
  assert.match(route, /is_bot/);
  assert.match(route, /fc_/);
});

test("Master Bot links campaign starts to the saved Telegram user without bypassing normal start handling", async () => {
  const telegram = await read("../src/routes/telegram.js");
  assert.match(telegram, /parseCampaignStartPayload/);
  assert.match(telegram, /recordCampaignStart/);
  assert.match(telegram, /internalUser\?\.id/);
  assert.match(telegram, /await handleMoviesStart\(env, bot, chatId, startPayload, telegramUser\?\.id\)/);
});

test("campaign analytics API is protected by the existing analytics permission", async () => {
  const route = await read("../src/index.js");
  const analytics = await read("../src/routes/analytics.js");
  assert.match(route, /\/api\/analytics\/campaigns/);
  assert.match(route, /PERMISSIONS\.analytics/);
  assert.match(analytics, /getCampaignAnalytics/);
  assert.match(analytics, /get_campaign_analytics/);
});

test("dashboard exposes the Facebook launch link and campaign funnel metrics", async () => {
  const dashboard = await read("../dashboard/src/AnalyticsSection.jsx");
  assert.match(dashboard, /\/api\/analytics\/campaigns/);
  assert.match(dashboard, /facebook_launch/);
  for (const metric of ["الزيارات البشرية", "زوار فريدون", "ضغطوا Start", "نسبة التحويل", "ضغطات المشاهدة"]) {
    assert.ok(dashboard.includes(metric), `missing campaign metric: ${metric}`);
  }
});
