"use client";

import { useState } from "react";

import Grid, { type PostListItem } from "./grid";
import Scene, { type SceneImage } from "./scene";

export default function Intro({
  images,
  posts,
}: {
  images: SceneImage[];
  posts: PostListItem[] | null;
}) {
  const [entered, setEntered] = useState(false);

  // The iteration-14 scene plays as an intro (auto-shuffling every 2s); clicking
  // it drops into the landing-page-style grid of all images.
  if (!entered) {
    return <Scene images={images} onEnter={() => setEntered(true)} />;
  }
  return <Grid posts={posts} />;
}
