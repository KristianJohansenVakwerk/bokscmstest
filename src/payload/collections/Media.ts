import type { CollectionConfig } from "payload";
import sharp from "sharp";

// Whole-image average color as a #rrggbb hex string. Resizing to a single pixel
// makes sharp area-average every pixel; transparency is flattened onto white
// first so alpha images don't average toward black.
export async function averageColorHex(
  input: Buffer | string,
): Promise<string> {
  const { data } = await sharp(input)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize(1, 1, { fit: "fill" })
    .toColorspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const [r, g, b] = data;
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

// Display (EXIF-corrected) pixel dimensions. Payload records the raw stored
// width/height, but images with an EXIF orientation of 5–8 are rotated 90°/270°
// when rendered, so their displayed dimensions are swapped. Returning the
// oriented size means the frontend reserves the correct aspect ratio up front
// (no layout jump once the rotated image loads).
export async function orientedSize(
  input: Buffer | string,
): Promise<{ width: number; height: number } | null> {
  const meta = await sharp(input).metadata();
  if (!meta.width || !meta.height) return null;
  const swap = typeof meta.orientation === "number" && meta.orientation >= 5;
  return swap
    ? { width: meta.height, height: meta.width }
    : { width: meta.width, height: meta.height };
}

export const Media: CollectionConfig = {
  slug: "media",
  upload: true,
  access: {
    read: () => true,
  },
  hooks: {
    // On upload, compute the image's average color and its EXIF-corrected
    // dimensions and store them so the frontend can paint a placeholder tint and
    // reserve the correct aspect ratio while the real image loads. Only runs when
    // a new file is present (req.file); plain metadata edits keep the old values.
    beforeChange: [
      async ({ data, req }) => {
        const file = req.file;
        const source = file?.data?.length ? file.data : file?.tempFilePath;
        if (source) {
          try {
            data.backgroundColor = await averageColorHex(source);
          } catch (err) {
            req.payload.logger.warn(
              `Media: could not compute backgroundColor: ${err}`,
            );
          }
          try {
            const size = await orientedSize(source);
            if (size) {
              data.width = size.width;
              data.height = size.height;
            }
          } catch (err) {
            req.payload.logger.warn(
              `Media: could not compute oriented dimensions: ${err}`,
            );
          }
        }
        return data;
      },
    ],
  },
  fields: [
    {
      name: "alt",
      type: "text",
    },
    {
      name: "backgroundColor",
      type: "text",
      admin: {
        readOnly: true,
        description:
          "Average color of the image (#rrggbb), computed on upload for load-state placeholders.",
      },
    },
  ],
};
