import test from "node:test";
import assert from "node:assert/strict";
import { generateAIReply, classifyAIError } from "../src/lib/ai.js";

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
    assert.match(requests[0].messages[0].content, /natural, fluent Moroccan Darija/i);
    assert.match(requests[0].messages[0].content, /Do not translate English expressions literally/i);
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


test("uses the native Workers AI binding without an API key", async () => {
  const calls = [];
  const env = {
    AI: {
      async run(model, options) {
        calls.push({ model, options });
        return { response: "مرحبا من Workers AI." };
      }
    }
  };
  const reply = await generateAIReply(
    env,
    { id: "bot-id" },
    "سلام",
    { config: { ...config, model: "@cf/qwen/qwen3.8-27b" } }
  );
  assert.equal(reply, "مرحبا من Workers AI.");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "@cf/qwen/qwen3.8-27b");
  assert.equal(calls[0].options.messages.at(-1).content, "سلام");
});

test("passes catalog tools to Workers AI and executes only returned catalog tool calls", async () => {
  const calls = [];
  const env = {
    AI: {
      async run(model, options) {
        calls.push({ model, options });
        if (calls.length === 1) {
          assert.deepEqual(options.tools.map((tool) => tool.name), [
            "search_catalog", "recommend_catalog_titles", "find_similar_titles"
          ]);
          return {
            tool_calls: [{
              name: "search_catalog",
              arguments: { query: "Dune", media_type: "movie" }
            }]
          };
        }
        return { response: "لقيت Dune (2021)." };
      }
    }
  };
  const db = createCatalogDb();
  const reply = await generateAIReply(
    env,
    { id: "bot-id" },
    "قلب ليا على Dune",
    { config: { ...config, model: "@cf/qwen/qwen3.8-27b" }, supabase: db }
  );
  assert.equal(reply, "لقيت Dune (2021).");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.messages[0].role, "system");
  assert.equal(calls[1].options.messages.filter((message) => message.role === "system").length, 1);
  assert.match(calls[1].options.messages[0].content, /Use only the returned FINDLY catalog records/);
  assert.ok(db.calls.some((call) => call.table === "movie_titles"));
});


test("retries a blank Workers AI response without catalog tools instead of falling through to the master menu", async () => {
  const calls = [];
  const env = {
    AI: {
      async run(model, options) {
        calls.push({ model, options });
        return calls.length === 1
          ? { response: "" }
          : { response: "مرحبا، أنا مساعد FINDLY. كيف نقدر نعاونك؟" };
      }
    }
  };
  const reply = await generateAIReply(
    env,
    { id: "bot-id" },
    "سلام",
    { config: { ...config, model: "@cf/qwen/qwen3.8-27b" }, supabase: createCatalogDb() }
  );
  assert.equal(reply, "مرحبا، أنا مساعد FINDLY. كيف نقدر نعاونك؟");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.tools.length, 3);
  assert.equal(calls[1].options.tools, undefined);
  assert.equal(calls[1].options.messages.at(-1).content, "سلام");
});


test("normalizes OpenAI-compatible chat-completion responses from the native Workers AI binding", async () => {
  const calls = [];
  const env = {
    AI: {
      async run(model, options) {
        calls.push({ model, options });
        return {
          choices: [{
            message: {
              role: "assistant",
              content: "مرحبا من استجابة chat completion."
            }
          }]
        };
      }
    }
  };
  const reply = await generateAIReply(
    env,
    { id: "bot-id" },
    "سلام",
    { config: { ...config, model: "@cf/qwen/qwen3.8-27b" } }
  );
  assert.equal(reply, "مرحبا من استجابة chat completion.");
  assert.equal(calls.length, 1);
});

test("normalizes nested chat-completion tool calls from the native Workers AI binding", async () => {
  const calls = [];
  const env = {
    AI: {
      async run(model, options) {
        calls.push({ model, options });
        if (calls.length === 1) {
          return {
            choices: [{
              message: {
                role: "assistant",
                content: null,
                tool_calls: [{
                  id: "call_catalog_nested",
                  type: "function",
                  function: {
                    name: "search_catalog",
                    arguments: JSON.stringify({ query: "Dune", media_type: "movie" })
                  }
                }]
              }
            }]
          };
        }
        return {
          choices: [{
            message: { role: "assistant", content: "لقيت Dune (2021)." }
          }]
        };
      }
    }
  };
  const db = createCatalogDb();
  const reply = await generateAIReply(
    env,
    { id: "bot-id" },
    "قلب ليا على Dune",
    { config: { ...config, model: "@cf/qwen/qwen3.8-27b" }, supabase: db }
  );
  assert.equal(reply, "لقيت Dune (2021).");
  assert.equal(calls.length, 2);
  assert.ok(db.calls.some((call) => call.table === "movie_titles"));
});


test("Workers AI binding rejects capacity-queued requests and classifies busy responses", async () => {
  let runOptions;
  const env = {
    AI: {
      async run(_model, _options, options) {
        runOptions = options;
        const error = new Error("Capacity temporarily exceeded, please try again.");
        error.status = 429;
        error.code = 3040;
        throw error;
      }
    }
  };

  await assert.rejects(
    generateAIReply(env, { id: "bot-id" }, "سلام", { config }),
    (error) => classifyAIError(error).category === "rate_limited"
  );
  assert.deepEqual(runOptions, { rejectIfBusy: true });
});

test("Workers AI binding times out instead of leaving the request pending", async () => {
  const env = {
    AI: {
      run() {
        return new Promise(() => {});
      }
    }
  };
  const shortConfig = { ...config, timeoutMs: 15 };
  await assert.rejects(
    generateAIReply(env, { id: "bot-id" }, "سلام", { config: shortConfig }),
    (error) => error?.name === "TimeoutError"
  );
});

test("Moroccan Darija policy includes natural phrasing examples and rejects malformed wording", async () => {
  let messages;
  const env = {
    AI: {
      async run(_model, options) {
        messages = options.messages;
        return { response: "مرحبا، شنو بغيتي تعرف؟" };
      }
    }
  };
  await generateAIReply(env, { id: "bot-id" }, "سلام", { config });
  const systemPrompt = messages[0].content;
  assert.match(systemPrompt, /Natural Moroccan Darija examples/i);
  assert.match(systemPrompt, /ما لقيتش/);
  assert.match(systemPrompt, /واش بغيتي/);
  assert.match(systemPrompt, /كاعيش/);
});
