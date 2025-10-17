const OpenAI = require("openai");

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
if (!OPENROUTER_API_KEY) {
  console.error("Missing OPENROUTER_API_KEY env var");
  process.exit(1);
}

const MODEL = "google/gemini-2.0-flash-001";
const RUNS = Number(process.argv[2] || 10);

function getTinySchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["ok", "kind"],
    properties: {
      ok: { type: "boolean" },
      kind: { type: "string", enum: ["ping", "pong"] },
    },
  };
}

function getMessages() {
  const system = "You are a helpful assistant.";
  const user =
    "Give a super short reply about ping vs pong. Keep it very brief.";
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

async function runOnce(client, i) {
  try {
    const res = await client.chat.completions.create({
      model: MODEL,
      messages: getMessages(),
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "tiny_test",
          schema: getTinySchema(),
          strict: true,
        },
      },
      temperature: 0.1,
    });

    const content = res?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      console.error(`#${i} No string content returned`, { content });
      return { ok: false, reason: "no_content" };
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error(`#${i} Invalid JSON returned:\n`, content);
      return { ok: false, reason: "invalid_json" };
    }

    const required = ["ok", "kind"];
    const missing = required.filter((k) => !(k in parsed));
    if (missing.length) {
      console.error(
        `#${i} Missing required keys:`,
        missing,
        "\nPayload:",
        parsed
      );
      return { ok: false, reason: "missing_keys", missing };
    }

    const allowed = new Set(["ok", "kind"]);
    const extra = Object.keys(parsed).filter((k) => !allowed.has(k));
    if (extra.length) {
      console.error(`#${i} Extra keys present:`, extra, "\nPayload:", parsed);
      return { ok: false, reason: "extra_keys", extra };
    }

    if (typeof parsed.ok !== "boolean") {
      console.error(`#${i} 'ok' must be boolean`, parsed);
      return { ok: false, reason: "wrong_type_ok" };
    }

    if (!["ping", "pong"].includes(parsed.kind)) {
      console.error(`#${i} 'kind' must be 'ping' or 'pong'`, parsed);
      return { ok: false, reason: "wrong_value_kind" };
    }

    console.log(`#${i} OK`);
    return { ok: true };
  } catch (err) {
    console.error(`#${i} Request failed`, err?.response?.data || err);
    return { ok: false, reason: "request_failed" };
  }
}

async function main() {
  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: OPENROUTER_API_KEY,
  });

  console.log(`Model: ${MODEL}  Runs: ${RUNS}`);
  const results = [];
  for (let i = 1; i <= RUNS; i++) {
    const r = await runOnce(client, i);
    results.push(r);
  }
  const ok = results.filter((r) => r.ok).length;
  const bad = results.length - ok;
  console.log(`\nSummary -> ok: ${ok}, failures: ${bad}`);
}

main().catch((e) => {
  console.error("Fatal error", e);
  process.exit(1);
});
