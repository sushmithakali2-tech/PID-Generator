import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import Anthropic from "@anthropic-ai/sdk";
import path from "path";
import { fileURLToPath } from "url";
import { KINDS, NAMES, sanitize, build, validate } from "./validate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null; // reads ANTHROPIC_API_KEY

app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/api/", rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false }));

const SYSTEM = `You convert a plain-language process description into an ordered list of P&ID items.
Reply with ONLY a JSON object, no prose and no code fences:
{"title": "short drawing title", "items": [{"k": "<kind>", "psv": 0}]}
Allowed kinds: ${KINDS.join(", ")}.
Meanings: ${KINDS.map((k) => `${k} = ${NAMES[k]}`).join("; ")}.
List items in flow order along a single main line.
Rules: put an isolation valve (valve) before every pump; after every pump put a check valve then an isolation valve;
set psv to 1 for every vessel; place a control valve (cvT, cvF, cvP or cvL) just upstream of the equipment it controls;
use cvT for temperature, cvF for flow, cvP for pressure, cvL for level. Maximum 20 items.`;

function parseJson(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{"), end = clean.lastIndexOf("}");
  return JSON.parse(clean.slice(start, end + 1));
}

app.get("/api/health", (_req, res) => res.json({ ok: true, ai: Boolean(client), model: MODEL }));

// Text description -> process items (+ server-side checks)
app.post("/api/generate", async (req, res) => {
  const description = String(req.body?.description || "").trim();
  if (!description) return res.status(400).json({ error: "Please describe your process." });
  if (description.length > 1000) return res.status(400).json({ error: "Description is too long (max 1000 characters)." });
  if (!client) return res.status(503).json({ error: "Server has no ANTHROPIC_API_KEY set." });
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: SYSTEM,
      messages: [{ role: "user", content: description }],
    });
    const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const parsed = parseJson(text);
    const items = sanitize(parsed.items);
    if (!items.length) return res.status(422).json({ error: "Could not build a process from that description. Try rephrasing." });
    res.json({ title: String(parsed.title || "Generated process").slice(0, 60), items, checks: validate(items) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Generation failed. Please try again." });
  }
});

// Items -> engineering checks
app.post("/api/validate", (req, res) => {
  const items = sanitize(req.body?.items);
  res.json({ checks: validate(items) });
});

// Items -> CSV with equipment list and instrument index
app.post("/api/export", (req, res) => {
  const items = sanitize(req.body?.items);
  const { stream, instruments } = build(items);
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    "EQUIPMENT AND VALVE LIST", "Tag,Description",
    ...stream.map((s) => [q(s.tag), q(s.label)].join(",")),
    "", "INSTRUMENT INDEX", "Transmitter,Controller,Service,Location,Final element",
    ...instruments.map((n) => [q(n.tag), q(n.loop), q(n.service), q(n.at), q(n.final)].join(",")),
  ];
  res.set({ "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="pid-lists.csv"' }).send(lines.join("\n"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`P&ID Generator running at http://localhost:${port}  (AI ${client ? "on" : "off: set ANTHROPIC_API_KEY"})`));
