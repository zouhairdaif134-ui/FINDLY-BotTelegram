import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("hourly queue Pages preview is classified as preview by Supabase client", async () => {
  const source = await readFile(new URL("./supabase.js", import.meta.url), "utf8");

  assert.match(
    source,
    /feat-hourly-movie-queue\.findly-bottelegram\.pages\.dev/,
    "the hourly queue preview must use preview Supabase configuration, never production credentials"
  );
});
