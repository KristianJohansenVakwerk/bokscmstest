import { getPosts } from "../_home/get-posts";
import Grid from "../_home/grid";

export const dynamic = "force-dynamic";

// The index: iteration 24's thumbnail grid with the big hover preview. (Not
// /index — Next.js treats that path as an alias for /.)
export default async function MosaicPage() {
  const { posts } = await getPosts();

  return (
    <div className="relative flex flex-1 flex-col bg-white">
      <Grid posts={posts} />
    </div>
  );
}
