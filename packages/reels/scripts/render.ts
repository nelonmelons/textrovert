/**
 * Renders a props JSON to <out>/<name>.mp4 plus still PNGs.
 *
 *   pnpm render .data/1652.json                 -> .data/1652.mp4, .data/1652.png
 *   pnpm render demo/demo-props.json --frames 0,200,400
 *
 * --frames lists extra still frames (written as <name>-f<frame>.png); the default still is the title card's
 * settled frame. --out sets the output directory (default .data/), --no-video renders stills only.
 */
import { readFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";

import { COMPOSITION_ID } from "../src/Root";
import type { ReelProps } from "../src/types";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string", default: join(root, ".data") },
    frames: { type: "string" },
    "no-video": { type: "boolean", default: false },
  },
});
const propsPath = positionals[0];
if (!propsPath) {
  console.error("usage: pnpm render <props.json> [--out dir] [--frames 0,120,300] [--no-video]");
  process.exit(1);
}
const inputProps: ReelProps = { photos: [], ...JSON.parse(readFileSync(resolve(propsPath), "utf8")) };
const name = basename(propsPath).replace(/(-props)?\.json$/, "");
mkdirSync(values.out, { recursive: true });

const serveUrl = await bundle({ entryPoint: join(root, "src/index.ts"), publicDir: join(root, "public") });
const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps });
console.log(`${name}: ${composition.durationInFrames} frames (${(composition.durationInFrames / composition.fps).toFixed(1)}s)`);

const still = join(values.out, name + ".png");
await renderStill({ serveUrl, composition, inputProps, output: still, frame: 60 });
console.log("still", still);
for (const frame of (values.frames ?? "").split(",").filter(Boolean).map(Number)) {
  const output = join(values.out, `${name}-f${frame}.png`);
  await renderStill({ serveUrl, composition, inputProps, output, frame: Math.min(frame, composition.durationInFrames - 1) });
  console.log("still", output);
}
if (!values["no-video"]) {
  const output = join(values.out, name + ".mp4");
  let last = -1;
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    codec: "h264",
    crf: 20,
    outputLocation: output,
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 10) * 10;
      if (pct !== last) console.log(`  ${pct}%`);
      last = pct;
    },
  });
  console.log("video", output);
}
