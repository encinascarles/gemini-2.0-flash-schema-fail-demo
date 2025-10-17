1. Set your API key

```bash
export OPENROUTER_API_KEY=your_key
```

2. Install deps

```bash
npm i
```

3. Run the large schema repro (often fails)

```bash
node repro-openrouter.js 10
```

- Model is set to `google/gemini-2.0-flash-001` in the script. You can try `google/gemini-2.0-flash-lite-001` for example to see it only fails with `google/gemini-2.0-flash-001`

4. Run the minimal schema repro (tiny 2-field schema)

```bash
node repro-openrouter-min.js 10
```

Notes

- Both scripts call OpenRouter via the OpenAI SDK with `response_format: { type: "json_schema", strict: true }`.
- The scripts frequently return outputs that don't match the declared schema.
