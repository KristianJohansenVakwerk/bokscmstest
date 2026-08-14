// One-off image classifier: labels the 30 newest post images as `object` or
// `process` using Claude Haiku 4.5 (cheapest), and writes the result to
// src/app/iterations/10/categorized.json for the iteration-10 page to render.
//
// Run:  node --env-file=.env scripts/classify-images.mjs
// Needs ANTHROPIC_API_KEY in .env and the dev server running on :3002.

import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.CLASSIFY_BASE_URL ?? "http://localhost:3002";
const LIMIT = 30;
const MODEL = "claude-haiku-4-5";

const CATEGORIES = ["object", "process"];
const SCHEMA = {
  type: "object",
  properties: { category: { type: "string", enum: CATEGORIES } },
  required: ["category"],
  additionalProperties: false,
};
const SYSTEM =
  "You label a single photograph as exactly one of two categories. " +
  "`object`: a finished thing, artifact, or artwork shown on its own (a scarf, a vase, a framed work, a sculpture). " +
  "`process`: something being made or in progress — materials, tools, a workshop, hands at work, an unfinished or staged scene. " +
  "Choose the single best fit.";

const client = new Anthropic();

const { docs } = await (
  await fetch(`${BASE}/api/posts?limit=${LIMIT}&depth=1&sort=-createdAt`)
).json();

const items = docs
  .map((doc) => {
    const img = doc.image && typeof doc.image === "object" ? doc.image : null;
    return img?.url ? { id: doc.id, url: img.url, alt: img.alt ?? doc.title } : null;
  })
  .filter(Boolean)
  .slice(0, LIMIT);

const results = [];
for (const it of items) {
  const original = Buffer.from(await (await fetch(`${BASE}${it.url}`)).arrayBuffer());
  const jpeg = await sharp(original)
    .resize({ width: 768, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 64,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } },
          { type: "text", text: "Classify this image as object or process." },
        ],
      },
    ],
    output_config: { format: { type: "json_schema", name: "classification", schema: SCHEMA } },
  });

  const text = resp.content.find((b) => b.type === "text")?.text ?? "{}";
  const category = JSON.parse(text).category;
  results.push({ ...it, category });
  console.log(`${String(it.id).padStart(4)}  ${category.padEnd(8)}  ${it.alt}`);
}

const out = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src/app/iterations/10/categorized.json",
);
writeFileSync(out, JSON.stringify(results, null, 2) + "\n");

const counts = CATEGORIES.map((c) => `${c}: ${results.filter((r) => r.category === c).length}`);
console.log(`\nWrote ${results.length} → ${out}  (${counts.join(", ")})`);
