import test from "node:test";
import assert from "node:assert/strict";
import {
  hasArabicSynopsis,
  translateSynopsisToArabic,
  resolveArabicSynopsis
} from "../src/routes/content.js";

test("detects Arabic synopsis text without treating English as Arabic", () => {
  assert.equal(hasArabicSynopsis("قصة عن رحلة طويلة"), true);
  assert.equal(hasArabicSynopsis("A long journey"), false);
  assert.equal(hasArabicSynopsis(""), false);
});

test("prefers a TMDB Arabic synopsis and preserves the English source", async () => {
  const result = await resolveArabicSynopsis({}, "قصة عربية من TMDB", "An English source synopsis.");
  assert.deepEqual(result, {
    overview: "قصة عربية من TMDB",
    original_overview: "An English source synopsis.",
    overview_language: "ar-SA",
    overview_source: "tmdb_ar"
  });
});

test("translates the source synopsis into Modern Standard Arabic when TMDB has no Arabic overview", async () => {
  const calls = [];
  const env = {
    AI: {
      async run(model, options, runtime) {
        calls.push({ model, options, runtime });
        return { response: "تدور الأحداث حول رحلة مليئة بالتحديات." };
      }
    }
  };
  const result = await resolveArabicSynopsis(env, "", "A story about a challenging journey.");
  assert.equal(result.overview, "تدور الأحداث حول رحلة مليئة بالتحديات.");
  assert.equal(result.original_overview, "A story about a challenging journey.");
  assert.equal(result.overview_language, "ar-SA");
  assert.equal(result.overview_source, "ai_translation");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "@cf/qwen/qwen3.8-27b");
  assert.equal(calls[0].runtime.rejectIfBusy, true);
  assert.match(calls[0].options.messages[0].content, /العربية الفصحى/);
});

test("rejects a translation response that does not contain Arabic text", async () => {
  await assert.rejects(
    translateSynopsisToArabic({ AI: { run: async () => ({ response: "Still English." }) } }, "Source text"),
    (error) => error.code === "SYNOPSIS_TRANSLATION_INVALID"
  );
});

test("keeps an existing Arabic source synopsis without calling AI", async () => {
  const result = await resolveArabicSynopsis({}, "", "هذا ملخص عربي موجود مسبقاً.");
  assert.equal(result.overview, "هذا ملخص عربي موجود مسبقاً.");
  assert.equal(result.overview_source, "existing_arabic");
});

test("marks a title without any synopsis as unavailable", async () => {
  const result = await resolveArabicSynopsis({}, "", "");
  assert.equal(result.overview, null);
  assert.equal(result.overview_language, "unavailable");
});
