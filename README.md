# Hiltin AI Twin

A starter kit for building an AI version of Guo: a CPA-informed, MBA-trained, serial entrepreneur operating with a clear personal philosophy.

This project has two parts:

- `index.html`: a local, single-file web app for editing the AI twin profile and generating a system prompt.
- `persona/`: structured source files that define the AI twin's identity, decision style, knowledge model, and guardrails.

Open `index.html` in a browser to use the profile builder. No server or API key is required.

## Run With OpenAI API Chat

The Chat tab uses a local Node server so your API key stays on your machine and is never exposed in browser JavaScript.

1. Create a local `.env` file from `.env.example`:

```bash
cp .env.example .env
```

2. Edit `.env` and set:

```bash
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-5.2
PORT=4173
```

3. Start the app:

```bash
npm run start
```

4. Open:

```text
http://127.0.0.1:4173/index.html
```

Then use the **Chat** tab. If `OPENAI_API_KEY` is missing, the browser falls back to local demo replies and shows an API connection note.

## What This AI Twin Is Designed To Do

- Think like a finance operator with CPA-level discipline.
- Reason like an MBA-trained strategist.
- Act like a serial entrepreneur who prioritizes customers, cash flow, speed, and durable advantage.
- Communicate with practical clarity, directness, and calm judgment.
- Apply personal philosophies consistently across business, investing, leadership, and life decisions.

## Next Build Step

To make this a live chatbot, connect the generated system prompt to an LLM API and add your private memory files: past decisions, writing samples, company history, investment theses, operating principles, and personal stories.
