import { getPayload } from "payload";

import config from "@payload-config";
import { COLUMNS, GUTTER_PX, generateMosaic, type MosaicItem } from "@/lib/mosaic";
import MosaicTile from "./mosaic-tile";

export const dynamic = "force-dynamic";

// One column's width, used as the grid's row height so an S tile (3x3) is
// square: 20px page margins each side + (COLUMNS-1) gutters of GUTTER_PX.
const ROW_HEIGHT = `max(40px, calc((100vw - 40px - ${(COLUMNS - 1) * GUTTER_PX}px) / ${COLUMNS}))`;

export default async function IterationPage({
  params,
}: {
  params: Promise<{ n: string }>;
}) {
  const { n } = await params;
  const parsed = Number.parseInt(n, 10);
  const seed = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;

  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "posts",
    depth: 1,
    limit: 0,
    sort: "-createdAt",
  });

  const items: MosaicItem[] = result.docs.flatMap((doc) => {
    const image =
      doc.image && typeof doc.image === "object"
        ? (doc.image as {
            url?: string | null;
            alt?: string | null;
            width?: number | null;
            height?: number | null;
          })
        : null;

    if (!image?.url) return [];

    const width = Number(image.width) || 1;
    const height = Number(image.height) || 1;

    return [
      {
        id: doc.id,
        imageUrl: image.url,
        imageAlt: image.alt ?? doc.title,
        isPortrait: height > width,
        aspect: height / width,
      },
    ];
  });

  const { placements } = generateMosaic(items, seed);

  return (
    <main className="px-5 pt-5">
      <ul
        className="grid list-none"
        style={{
          gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))`,
          gridAutoRows: ROW_HEIGHT,
          gap: `${GUTTER_PX}px`,
        }}
      >
        {placements.map((p) => (
          <MosaicTile key={String(p.id)} p={p} />
        ))}
      </ul>
    </main>
  );
}
