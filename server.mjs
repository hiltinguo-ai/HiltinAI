import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const model = process.env.OPENAI_MODEL || "gpt-5.2";
const ttsModel = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const ttsVoice = process.env.OPENAI_TTS_VOICE || "nova";
const ttsInstructions = process.env.OPENAI_TTS_INSTRUCTIONS
  || "Speak like a 35-year-old Chinese-Australian woman: warm, direct, founder-operator energy, slightly reflective, natural Chinese-English bilingual cadence, calm but energetic, not polished corporate.";

loadDotEnv();

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"]
]);

const skillContextFiles = [
  "skills/guo-ai-twin/references/identity-voice.md",
  "skills/guo-ai-twin/references/x-archive-summary.md",
  "skills/guo-founder-operator/references/founder-operating-principles.md",
  "skills/guo-founder-operator/references/restaurant-ai-venture.md",
  "skills/guo-cpa-knowledge/references/accounting-framework.md",
  "skills/guo-mba-strategy/references/strategy-playbook.md",
  "skills/guo-life-philosophy/references/lived-principles.md"
];

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "POST" && url.pathname === "/api/chat") {
      await handleChat(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/speech") {
      await handleSpeech(req, res);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    await serveStatic(url.pathname, res, req.method === "HEAD");
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Internal server error" });
  }
});

server.listen(port, () => {
  console.log(`Hiltin.AI running at http://127.0.0.1:${port}/index.html`);
});

async function handleChat(req, res) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    sendJson(res, 400, {
      error: "OPENAI_API_KEY is not set. Add it to .env or export it before starting the server."
    });
    return;
  }

  const body = await readJsonBody(req);
  const userMessage = String(body.message || "").trim();
  if (!userMessage) {
    sendJson(res, 400, { error: "Message is required." });
    return;
  }

  const profilePrompt = String(body.profilePrompt || "").trim();
  const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
  const skillContext = await loadSkillContext();

  const instructions = [
    profilePrompt,
    "Use the following local skill summaries as durable context. Do not claim access to files not shown in this request.",
    skillContext,
    "Answer as Hiltin.AI: direct, founder/operator, CPA-aware, MBA-strategic, people-first, and practical. End with a useful next action. Do not use Markdown heading markers such as ## or bold markers such as ** in the chat response. Write in conversational chunks. Keep each paragraph or line under 600 characters. Use no more than 5 chat bubbles worth of content per response."
  ].filter(Boolean).join("\n\n---\n\n");

  const conversation = history
    .filter((message) => ["user", "assistant"].includes(message.role) && message.text)
    .map((message) => `${message.role.toUpperCase()}: ${String(message.text).slice(0, 6000)}`)
    .join("\n\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      instructions,
      input: [
        conversation ? `Conversation so far:\n${conversation}` : "",
        `Current user message:\n${userMessage}`
      ].filter(Boolean).join("\n\n---\n\n")
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    sendJson(res, response.status, {
      error: data.error?.message || "OpenAI API request failed."
    });
    return;
  }

  sendJson(res, 200, {
    reply: extractOutputText(data),
    model
  });
}

async function handleSpeech(req, res) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    sendJson(res, 400, {
      error: "OPENAI_API_KEY is not set. Add it to .env or export it before starting the server."
    });
    return;
  }

  const body = await readJsonBody(req);
  const input = String(body.text || "").trim().slice(0, 4000);
  if (!input) {
    sendJson(res, 400, { error: "Text is required." });
    return;
  }

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: ttsModel,
      voice: ttsVoice,
      input,
      instructions: ttsInstructions,
      response_format: "mp3"
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    sendJson(res, response.status, {
      error: data.error?.message || "OpenAI speech request failed."
    });
    return;
  }

  const audio = Buffer.from(await response.arrayBuffer());
  res.writeHead(200, {
    "Content-Type": "audio/mpeg",
    "Cache-Control": "no-store"
  });
  res.end(audio);
}

async function serveStatic(urlPath, res, headOnly) {
  const normalizedPath = decodeURIComponent(urlPath === "/" ? "/index.html" : urlPath);
  const requestedPath = path.normalize(normalizedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(__dirname, requestedPath);

  if (!filePath.startsWith(__dirname) || !existsSync(filePath)) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes.get(ext) || "application/octet-stream";
  const data = headOnly ? null : await readFile(filePath);
  res.writeHead(200, { "Content-Type": contentType });
  res.end(data);
}

async function loadSkillContext() {
  const sections = [];
  for (const relativePath of skillContextFiles) {
    const absolutePath = path.join(__dirname, relativePath);
    if (!existsSync(absolutePath)) continue;
    const text = await readFile(absolutePath, "utf8");
    sections.push(`# ${relativePath}\n${text.slice(0, 9000)}`);
  }
  return sections.join("\n\n");
}

async function readJsonBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) {
      throw new Error("Request body too large");
    }
  }
  return raw ? JSON.parse(raw) : {};
}

function extractOutputText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        parts.push(content.text);
        continue;
      }
      if (content.text && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim() || "I did not receive a text response from the model.";
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!existsSync(envPath)) return;

  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
