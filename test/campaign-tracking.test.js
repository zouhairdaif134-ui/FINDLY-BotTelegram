import test from "node:test";
import assert from "node:assert/strict";
import { buildCampaignStartPayload, buildCampaignTelegramUrl, classifyCrawlerUserAgent, parseCampaignStartPayload, resolveCampaignSource } from "../src/lib/campaign-tracking.js";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("campaign redirect is routed through the Worker before the SPA fallback", async () => {
  const route = await read("../src/index.js");
  const config = await read("../wrangler.jsonc");
  assert.match(route, /handleCampaignRedirect/);
  assert.match(config, /"\/go\/\*"/);
});

test("campaign redirect generates a bounded Telegram start token and excludes crawler traffic", async () => {
  const tracking = await read("../src/lib/campaign-tracking.js");
  assert.match(tracking, /campaign_visit/);
  assert.match(tracking, /GET, HEAD/);
  assert.match(tracking, /FALLBACK_MASTER_URL/);
  assert.match(tracking, /visitor_hash/);
  assert.ok(tracking.includes("campaignSlug + \":\" + visitorId"));
  assert.match(tracking, /is_bot/);
  assert.match(tracking, /fc_/);
  assert.ok(tracking.includes(`visitSaved && request.method === "GET" && !existingVisitorId`));
  assert.doesNotMatch(tracking, /CF-Connecting-IP|cf-connecting-ip/);
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

test("campaign start payloads are compact, URL-safe and strictly parsed", () => {
  const token = "a1b2c3d4e5f60718293a4b5c";
  const payload = buildCampaignStartPayload(token);
  assert.equal(payload, "fc_" + token);
  assert.deepEqual(parseCampaignStartPayload(payload), { visitToken: token });
  assert.equal(payload.length <= 64, true);
  assert.equal(parseCampaignStartPayload("facebook_launch"), null);
  assert.equal(parseCampaignStartPayload("fc_short"), null);
});

test("campaign source is derived from an allowed campaign slug prefix", () => {
  assert.equal(resolveCampaignSource("facebook_launch"), "facebook");
  assert.equal(resolveCampaignSource("instagram_story_01"), "instagram");
  assert.equal(resolveCampaignSource("whatsapp_status"), "whatsapp");
  assert.equal(resolveCampaignSource("unknown_launch"), null);
  assert.equal(resolveCampaignSource("../facebook"), null);
});

test("known social crawlers are excluded while normal mobile browsers remain human visits", () => {
  assert.deepEqual(classifyCrawlerUserAgent("facebookexternalhit/1.1"), {
    isBot: true, crawlerName: "facebook"
  });
  assert.deepEqual(classifyCrawlerUserAgent("WhatsApp/2.24"), {
    isBot: true, crawlerName: "whatsapp"
  });
  assert.deepEqual(classifyCrawlerUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36"), {
    isBot: false, crawlerName: null
  });
});

test("campaign links always target the configured FINDLY Master bot and preserve Telegram payload rules", () => {
  const token = "a1b2c3d4e5f60718293a4b5c";
  assert.equal(
    buildCampaignTelegramUrl("@FindlySearch2026Bot", token),
    "https://t.me/FindlySearch2026Bot?start=fc_" + token
  );
  assert.equal(buildCampaignTelegramUrl("bad", token), null);
});
