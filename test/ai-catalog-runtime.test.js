import test from "node:test";
import assert from "node:assert/strict";
import { generateAIReply } from "../src/lib/ai.js";

function createCatalogDb() {
  const calls = [];
  const title = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    title: "Dune",
    original_title: "Dune",
    media_type: "movie",
    release_year: 2021,
    release_date: "2021-10-22",
    rating: 8,
    runtime_minutes: 155,
    overview: "A science fiction story."
  };
  return {
    calls,
    from(table) {
      const operations = [];
      const builder = {};
      for (const method of ["select", "eq", "ilike", "order", "limit", "in", "not"]) {
        builder[method] = (...args) => { operations.push([method, ...args]); return builder; };
      }
      builder.then = (resolve, reject) => {
        calls.push({ table, operations });
        const data = table === "movie_titles"
          ? [title]
          : [{ title_id: title.id, movie_genres: { name: "Science Fiction" } }];
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      };
      return builder;
    }
  };
}

const config = {
  enabled: true,
  model: "test-model",
  apiUrl: "https://api.openai.com/v1/chat/completions",
  systemPrompt: "You are FINDLY.",
  temperature: 0.7,
  maxTokens: 500,
  timeoutMs: 5000
};

test("AI uses only the fixed catalog tools, executes search, then grounds its final reply in tool output", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    if (requests.length === 1) {
      return Response.json({
        choices: [{
          message: {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: "call_catalog_1",
              type: "function",
              function: { name: "search_catalog", arguments: JSON.stringify({ query: "Dune", media_type: "movie" }) }
            }]
          }
        }]
      });
    }
    return Response.json({ choices: [{ message: { role: "assistant", content: "لقيت Dune (2021)، بتقييم 8/10." } }] });
  };
  const db = createCatalogDb();
  try {
    const reply = await generateAIReply(
      { AI_API_KEY: "test-secret" },
      { id: "bot-id" },
      "قلب ليا على Dune",
      { config, supabase: db }
    );
    assert.equal(reply, "لقيت Dune (2021)، بتقييم 8/10.");
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0].tools.map((tool) => tool.function.name), ["search_catalog", "recommend_catalog_titles", "find_similar_titles"]);
    assert.match(requests[0].messages[0].content, /conversational requests.*mood.*recommend_catalog_titles/i);
    assert.match(requests[0].messages[0].content, /only when a matching genre exists in the catalog/i);
    assert.match(requests[0].messages[0].content, /full details.*search_catalog/i);
    assert.equal(requests[1].tools, undefined);
    assert.ok(requests[1].messages.some((message) => message.role === "tool" && message.content.includes('"title":"Dune"')));
    assert.ok(db.calls.some((call) => call.table === "movie_titles" && call.operations.some(([method, column, value]) => method === "eq" && column === "status" && value === "active")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AI does not expose catalog tools when no trusted database handle is supplied", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return Response.json({ choices: [{ message: { role: "assistant", content: "مرحبا." } }] });
  };
  try {
    const reply = await generateAIReply(
      { AI_API_KEY: "test-secret" },
      { id: "bot-id" },
      "سلام",
      { config }
    );
    assert.equal(reply, "مرحبا.");
    assert.equal(requestBody.tools, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AI caps provider tool calls and never executes unknown function names", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    if (requests.length === 1) {
      return Response.json({
        choices: [{
          message: {
            role: "assistant",
            tool_calls: Array.from({ length: 5 }, (_, index) => ({
              id: "call_" + index,
              type: "function",
              function: { name: "untrusted_function", arguments: "{}" }
            }))
          }
        }]
      });
    }
    return Response.json({ choices: [{ message: { role: "assistant", content: "ما عنديش بيانات كافية." } }] });
  };
  const db = createCatalogDb();
  try {
    const reply = await generateAIReply(
      { AI_API_KEY: "test-secret" },
      { id: "bot-id" },
      "ساعدني",
      { config, supabase: db }
    );
    assert.equal(reply, "ما عنديش بيانات كافية.");
    assert.equal(requests[1].messages.filter((message) => message.role === "tool").length, 3);
    assert.equal(db.calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
