import { getPosts } from "./_home/get-posts";
import IntroScene from "./_home/intro-scene";

export const dynamic = "force-dynamic";

// The final site's landing page: iteration 14's intro scene (five images fly in,
// clicking swaps them) with iteration 24's wordmark on top. The index grid lives
// at /mosaic; contact is a global overlay opened from the nav.
export default async function HomePage() {
  const { images } = await getPosts();

  return (
    <div className="fixed inset-0">
      <IntroScene images={images} />
      {/* Iteration 24's wordmark at half its full-width size, layered above the
          scene so the images never cover it. Click-through, so clicks still
          reach the scene and swap the images. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/karl-logo.svg"
          alt="Karl Monies"
          style={{ width: "calc((100vw - 60px) / 2)", height: "auto" }}
        />
      </div>
    </div>
  );
}
