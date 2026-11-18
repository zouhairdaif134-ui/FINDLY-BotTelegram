import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildMovieCampaignSlug,
  buildMovieCampaignStartPayload,
  parseCampaignStartPayload
} from "../src/lib/campaign-tracking.js";

const movieId = "550e8400-e29b-41d4-a716-446655440000";
const token = "a1b2c3d4e5f60718293a4b5c";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("movie share campaigns get a readable, source-specific slug per title", () => {
  assert.equal(
    buildMovieCampaignSlug("facebook", "Wicker (2026)", movieId),
    "facebook_movie_wicker_2026_550e8400"
  );
  assert.equal(
    buildMovieCampaignSlug("whatsapp", "Wicker (2026)", movieId),
    "whatsapp_movie_wicker_2026_550e8400"
  );
  assert.equal(buildMovieCampaignSlug("unknown", "Wicker", movieId), "direct_movie_wicker_550e8400");
});

test("movie Mini App payload preserves the movie deep link and carries the visit token", () => {
  const payload = buildMovieCampaignStartPayload(movieId, token);
  assert.equal(payload, "movie_" + movieId + "_fc_" + token);
  assert.equal(payload.length <= 512, true);
  assert.deepEqual(parseCampaignStartPayload(payload), { visitToken: token, titleId: movieId });
  assert.deepEqual(parseCampaignStartPayload("fc_" + token), { visitToken: token });
  assert.equal(parseCampaignStartPayload("movie_" + movieId + "_fc_short"), null);
});

test("public movie share pages create uncached visit tokens and pass tracked Mini App links to the CTA", async () => {
  const route = await read("../src/index.js");
  const tracking = await read("../src/lib/campaign-tracking.js");
  const sharing = await read("../src/lib/movie-sharing.js");
  assert.match(route, /recordMovieShareVisit/);
  assert.match(route, /Cache-Control": "no-store/);
  assert.match(route, /renderMovieSharePage\([\s\S]*attribution\.telegramUrl/);
  assert.match(tracking, /export async function recordMovieShareVisit/);
  assert.match(sharing, /trackedTelegramUrl/);
  assert.match(sharing, /startapp=/);
});

test("Mini App attributes movie campaign starts from Telegram's signed start_param without losing the movie deep link", async () => {
  const route = await read("../src/routes/miniapp.js");
  const app = await read("../miniapp/app.js");
  assert.match(route, /startParam: params\.get\("start_param"\)/);
  assert.match(route, /recordCampaignStart\(env,[\s\S]*startParam/);
  assert.match(app, /movie_\(\[0-9a-f-\]\{36\}\)\(\?:_fc_\[a-f0-9\]\{24\}\)\?/i);
  assert.match(app, /await trackAnalyticsEvent\("miniapp_opened"/);
});

test("Mini App copy-film-link and generated share captions use the tracked public share page", async () => {
  const app = await read("../miniapp/app.js");
  const sharing = await read("../src/lib/movie-sharing.js");
  assert.match(app, /copyShareText\(s\.sharePageUrl\)/);
  assert.match(sharing, /overview,[\s\S]*sharePageUrl/);
  assert.match(sharing, /sharePageUrl,"","#FINDLYMovies #Cinema/);
});

test("campaign analytics dashboard displays per-film campaign slugs", async () => {
  const dashboard = await read("../dashboard/src/AnalyticsSection.jsx");
  assert.match(dashboard, /campaignDisplayLabel/);
  assert.match(dashboard, /row\.campaign_slug/);
});
