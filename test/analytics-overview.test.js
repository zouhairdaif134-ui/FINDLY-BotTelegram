import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("analytics overview migration deduplicates Mini App sessions and protects private telemetry", async () => {
  const migration = await read("../supabase/migrations/20261115160000_findly_analytics_overview.sql");
  assert.match(migration, /create unique index[^;]*miniapp_session_unique_idx/is);
  assert.match(migration, /event_type\s*=\s*'miniapp_opened'/i);
  assert.match(migration, /create or replace function public\.get_findly_analytics_overview/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /revoke execute on function public\.get_findly_analytics_overview/i);
  assert.match(migration, /grant execute on function public\.get_findly_analytics_overview[^;]*service_role/i);
});

test("analytics overview API is protected by the existing analytics permission", async () => {
  const route = await read("../src/index.js");
  const analytics = await read("../src/routes/analytics.js");
  assert.match(analytics, /export async function getFindlyAnalyticsOverview/);
  const endpoint = route.slice(route.indexOf('"/api/analytics/overview"'), route.indexOf('"/api/analytics/movie-referrals"'));
  assert.match(endpoint, /requirePermission/);
  assert.match(endpoint, /PERMISSIONS\.analytics/);
  assert.match(endpoint, /getFindlyAnalyticsOverview/);
});

test("Mini App records one authenticated open per session and ad-provider outcomes", async () => {
  const route = await read("../src/routes/miniapp.js");
  const app = await read("../miniapp/app.js");
  assert.match(route, /analytics\/track/);
  assert.match(route, /miniapp_opened/);
  assert.match(route, /ad_provider_(request|resolved|failed)/);
  assert.match(route, /user_bots/);
  assert.match(app, /trackAnalyticsEvent\("miniapp_opened"/);
  assert.match(app, /trackProviderAdEvent\("monetag","request"/);
  assert.match(app, /trackProviderAdEvent\("adsgram","request"/);
  assert.match(app, /trackProviderAdEvent\("adsgram","resolved"/);
  assert.match(app, /trackProviderAdEvent\("adsgram","failed"/);
});

test("dashboard overview displays unified users, bot split, Mini App traffic and provider telemetry", async () => {
  const section = await read("../dashboard/src/AnalyticsSection.jsx");
  assert.match(section, /\/api\/analytics\/overview/);
  for (const label of ["المستخدمون الفريدون", "Master Bot", "Watch Bot", "المشتركون بين البوتين", "زوار Mini App", "Monetag", "AdsGram"]) {
    assert.ok(section.includes(label), `missing dashboard metric: ${label}`);
  }
  assert.match(section, /الإيرادات غير متاحة|لم يتم ربط تقارير الإيرادات/);
});
