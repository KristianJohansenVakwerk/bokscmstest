// Deterministic, seeded mosaic layout engine.
//
// Given a list of images and a numeric seed, it produces a reproducible
// arrangement of tiles on a 9-column masonry grid. The same seed always
// yields the same layout, so it is safe to compute during SSR and to key
// off the URL (one seed == one "iteration").
//
// Ruleset:
//   - 9 columns, three width tiers (S, M, L).
//   - Weights: S 60%, M 25%, L 15% — biased to the extremes for contrast.
//   - Width by tier:  S = 1 or 2 cols, M = 4 cols, L = 7 cols.
//   - Orientation caps: a portrait tile is at most 4 cols, a landscape tile
//     at most 7 cols. So an L is 7 cols when landscape, 4 cols when portrait.
//   - Height follows each image's real aspect ratio, so tiles are naturally
//     proportioned rather than letterboxed.
//   - Some tiles overlap their neighbours via a CSS transform + z-index.

export const COLUMNS = 9;
export const GUTTER_PX = 80;
export const ITERATION_COUNT = 21;

const PORTRAIT_MAX_COLS = 4;
const LANDSCAPE_MAX_COLS = 7;

export type Size = "S" | "M" | "L";

const TIER_COLS: Record<Size, number> = { S: 1, M: 4, L: 7 };

export type MosaicItem = {
  id: string | number;
  imageUrl: string;
  imageAlt: string;
  isPortrait: boolean;
  aspect: number; // height / width
};

export type Placement = MosaicItem & {
  size: Size;
  colStart: number; // 1-based grid line
  colSpan: number;
  rowStart: number; // 1-based grid line
  rowSpan: number;
  z: number;
  overlap: boolean;
  dx: number; // horizontal nudge, % of tile width (overlap only)
  dy: number; // vertical nudge, % of tile height (overlap only)
};

// mulberry32 — a small, fast, deterministic PRNG.
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickSize(rng: () => number): Size {
  const r = rng();
  return r < 0.6 ? "S" : r < 0.85 ? "M" : "L";
}

// Width tier + orientation cap decide colSpan; height follows the image's
// real aspect so the tile isn't stretched or heavily letterboxed. S tiles
// vary between 1 and 2 cols so the smalls aren't all identical.
function spans(size: Size, item: MosaicItem, rng: () => number) {
  const cap = item.isPortrait ? PORTRAIT_MAX_COLS : LANDSCAPE_MAX_COLS;
  const baseCols = size === "S" ? (rng() < 0.5 ? 1 : 2) : TIER_COLS[size];
  const colSpan = Math.min(baseCols, cap);
  const rowSpan = Math.max(1, Math.round(colSpan * item.aspect));
  return { colSpan, rowSpan };
}

// Find the leftmost placement whose spanned columns sit highest (classic
// masonry pack). Returns 1-based grid lines.
function pack(colHeights: number[], colSpan: number) {
  let bestCol = 1;
  let bestTop = Infinity;
  for (let c = 1; c + colSpan - 1 <= COLUMNS; c++) {
    let top = 0;
    for (let k = 0; k < colSpan; k++) top = Math.max(top, colHeights[c - 1 + k]);
    if (top < bestTop) {
      bestTop = top;
      bestCol = c;
    }
  }
  return { colStart: bestCol, rowStart: bestTop + 1 };
}

export function generateMosaic(items: MosaicItem[], seed: number) {
  const rng = makeRng(seed);
  const colHeights = new Array<number>(COLUMNS).fill(0);
  const placements: Placement[] = [];

  for (const item of items) {
    const size = pickSize(rng);
    const { colSpan, rowSpan } = spans(size, item, rng);
    const { colStart, rowStart } = pack(colHeights, colSpan);

    // Reserve the packed slot so the grid stays dense; overlap is a purely
    // visual transform layered on top, which keeps packing predictable.
    for (let k = 0; k < colSpan; k++) {
      colHeights[colStart - 1 + k] = rowStart - 1 + rowSpan;
    }

    const canOverlap = rowStart > 1;
    const overlap = canOverlap && rng() < 0.2;

    placements.push({
      ...item,
      size,
      colStart,
      colSpan,
      rowStart,
      rowSpan,
      z: overlap ? 20 : 1,
      overlap,
      dx: overlap ? Math.round(rng() * 40 - 20) : 0, // -20%..+20%
      dy: overlap ? -Math.round(rng() * 25 + 15) : 0, // -15%..-40%
    });
  }

  const rows = colHeights.reduce((m, h) => Math.max(m, h), 0);
  return { placements, rows };
}
