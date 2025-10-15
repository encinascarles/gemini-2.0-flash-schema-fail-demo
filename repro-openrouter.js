const OpenAI = require("openai");

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
if (!OPENROUTER_API_KEY) {
  console.error("Missing OPENROUTER_API_KEY env var");
  process.exit(1);
}

const MODEL = "google/gemini-2.0-flash-001";
const RUNS = Number(process.argv[2] || 10);

// Minimal schema used in our production app (trimmed for repro)
function getRecipeSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "title",
      "duration",
      "servings",
      "ingredients",
      "instructions",
      "recommendations",
      "invalid_recipe",
      "detected_language",
    ],
    properties: {
      title: { type: "string" },
      duration: {
        type: "string",
        enum: [
          "10min",
          "15min",
          "20min",
          "30min",
          "45min",
          "1h",
          "1h30",
          "2h",
          "2h30",
          "3h",
          "4h",
          "+4h",
        ],
      },
      servings: { type: "integer" },
      ingredients: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["section_name", "ingredients"],
          properties: {
            section_name: { type: "string" },
            ingredients: { type: "string" },
          },
        },
      },
      instructions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["section_name", "instructions"],
          properties: {
            section_name: { type: "string" },
            instructions: { type: "string" },
          },
        },
      },
      recommendations: { type: "string" },
      invalid_recipe: { type: "boolean" },
      detected_language: { type: "string" },
    },
  };
}

function getMessages() {
  const system =
    "You are a recipe extraction AI. Output only JSON that strictly matches the provided schema.";
  const user =
    "<task>\n" +
    "  <language>\n" +
    "    <mode>maintain</mode>\n" +
    '    <target code="none"/>\n' +
    "  </language>\n\n" +
    '  <source platform="web">\n' +
    "    <title><![CDATA[Quick Tomato Pasta]]></title>\n" +
    "    <description><![CDATA[Simple tomato pasta with garlic and basil.]]></description>\n" +
    "    <transcript><![CDATA[Boil pasta. In a pan, sauté garlic, add tomatoes, simmer, toss pasta, finish with basil.]]></transcript>\n" +
    "  </source>\n" +
    "</task>";
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
          name: "recipe_extraction",
          schema: getRecipeSchema(),
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

    const required = [
      "title",
      "duration",
      "servings",
      "ingredients",
      "instructions",
      "recommendations",
      "invalid_recipe",
      "detected_language",
    ];
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

    // Basic type shape checks
    if (
      !Array.isArray(parsed.ingredients) ||
      !Array.isArray(parsed.instructions)
    ) {
      console.error(`#${i} Invalid types for ingredients/instructions`, parsed);
      return { ok: false, reason: "wrong_types" };
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
