# Layout iterations & image classification

A playground for experimenting with how the post images are laid out, plus a
first pass at AI motif classification. Everything lives under `/iterations`.

## Where things are

| Path | What |
|---|---|
| `src/app/iterations/[n]/page.tsx` | Seeded mosaic — one deterministic layout per seed `n` (1–8). |
| `src/app/iterations/9/page.tsx` | Dense 17-column contact sheet of every post, edge-to-edge. |
| `src/app/iterations/10/page.tsx` | The 30 newest images grouped by AI category (see below). |
| `src/app/iterations/layout.tsx` + `nav.tsx` | Fixed top nav (pills 1–N). `ITERATION_COUNT` sets N. |
| `src/lib/mosaic.ts` | The deterministic mosaic engine + all tunables (columns, gutter, size tiers, weights, overlap, `ITERATION_COUNT`). |
| `scripts/classify-images.mjs` | One-off classifier (Claude Haiku 4.5). Writes iteration 10's data. |

View at `http://localhost:3002/iterations/1` … `/iterations/10`.

## Image classification (iteration 10) — in progress

Classifies the 30 newest post images into two categories — **`object`**
(a finished thing/artwork shown on its own) and **`process`** (something being
made / materials / workshop / in-progress) — using **`claude-haiku-4-5`**
(cheapest), resizing each image to 768px before sending to keep cost negligible
(well under $0.05 for 30). Result is written to
`src/app/iterations/10/categorized.json` and rendered by iteration 10.

Status: **code is done; the run hasn't happened yet.** `categorized.json` is an
empty `[]` placeholder, so `/iterations/10` shows a "run the script" message.

### To continue on another machine

1. `git pull` this branch (`fix/dropbox-auth-gate-all-routes`).
2. `npm install` (picks up the new `@anthropic-ai/sdk` dependency).
3. Add your key to `.env` (git-ignored, not committed):
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
4. Start the dev server (must be on `http://localhost:3002`; override with
   `CLASSIFY_BASE_URL` if different).
5. Run the classifier:
   ```
   node --env-file=.env scripts/classify-images.mjs
   ```
   It prints each `id → category` and writes `categorized.json`.
6. Open `http://localhost:3002/iterations/10`.

### Tuning the classifier

- **Model / count / categories:** constants at the top of
  `scripts/classify-images.mjs` (`MODEL`, `LIMIT`, `CATEGORIES`, `SCHEMA`).
- **What "object" vs "process" means:** the `SYSTEM` prompt in that file — edit
  and re-run if the split looks wrong. Add categories by extending the enum in
  both `SCHEMA` (script) and `CATEGORIES` (page).
- Uses structured outputs (`output_config.format` + JSON schema) so the model is
  forced to return one of the allowed labels — no loose parsing.

### Next steps / ideas

- If the object/process split looks good, scale to all ~270 posts via the Batch
  API (50% cheaper) and store the category on the Payload `posts`/`media`
  collection instead of a JSON file, so it's filterable in admin.
- Optionally add a Payload `afterChange` hook on `media` to auto-classify new
  Dropbox uploads.

## Not included in this branch

Some unrelated pre-existing working-tree changes were intentionally left
uncommitted: `media/local*.png` deletions, `scripts/bin/import-to-sqlite.cjs`,
and `src/app/(payload)/admin/importMap.js`.
