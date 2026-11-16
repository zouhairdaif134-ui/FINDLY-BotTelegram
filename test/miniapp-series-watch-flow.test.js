import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const miniappRoute = await readFile(new URL("../src/routes/miniapp.js", import.meta.url), "utf8");
const miniappClient = await readFile(new URL("../miniapp/app.js", import.meta.url), "utf8");
const moviesBot = await readFile(new URL("../src/lib/movies-bot.js", import.meta.url), "utf8");

test("series details expose only episodes with active uploaded media and episode deep links", () => {
  assert.match(miniappRoute, /select\("episode_id,file_id,media_type"\)/);
  assert.match(miniappRoute, /\.not\("episode_id",\s*"is",\s*null\)/);
  assert.match(miniappRoute, /\.in\("id",\s*uploadedEpisodeIds\)/);
  assert.match(miniappRoute, /episode_"\s*\+\s*episode\.id/);
});

test("series details do not expose a title-level watch deep link", () => {
  assert.match(miniappRoute, /title\.media_type\s*===\s*"movie"[\s\S]*?watchUrl/);
  assert.match(miniappRoute, /watch_url:\s*title\.media_type\s*===\s*"movie"\s*\?\s*watchUrl\s*:\s*null/);
});

test("Mini App renders uploaded episodes as individual Watch Bot links", () => {
  assert.match(miniappClient, /s\.episodes\s*\|\|\s*\[\]/);
  assert.match(miniappClient, /e\.watch_url/);
  assert.match(miniappClient, /data-watch-episode/);
  assert.match(miniappClient, /episodeLink=event\.target\.closest\("a\[data-watch-episode\]"\)[\s\S]*?openWatchBotLink\(url\)/);
  assert.match(miniappClient, /if\(b\.dataset\.watch\)[\s\S]*?t\?\.media_type!=="movie"/);
});

test("Watch Bot keeps episode deep links on the delivery-only episode path", () => {
  assert.match(moviesBot, /episode_\(\[0-9a-f-\]\{36\}\)/);
  assert.match(moviesBot, /payload\?\.action\s*===\s*"episode"[\s\S]*?sendWatchEpisode\(env, bot, chatId, payload\.episodeId\)/);
  assert.match(moviesBot, /async function sendWatchEpisode/);
});
