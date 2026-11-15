import type { FrameExtraction } from "./screenshots.ts";
import { extractWindow, type FrameInput, type VisionOptions } from "./vision.ts";

export interface RecordingOptions {
  durationSec: number;
  getFrame: (timeSec: number) => Promise<string>;
  vision: VisionOptions;
  fps?: number;
  framesPerWindow?: number;
  overlapFrames?: number;
  onProgress?: (windowsRead: number, windowsTotal: number) => void;
}

export async function readRecording(opts: RecordingOptions): Promise<FrameExtraction[]> {
  const fps = opts.fps ?? 6;
  const size = opts.framesPerWindow ?? 10;
  const overlap = opts.overlapFrames ?? 2;
  const times: number[] = [];
  for (let t = 0; t < opts.durationSec; t += 1 / fps) times.push(Math.round(t * 1000) / 1000);

  const windows: number[][] = [];
  for (let start = 0; start < times.length; start += size - overlap) {
    windows.push(times.slice(start, start + size));
    if (start + size >= times.length) break;
  }

  const results: FrameExtraction[] = new Array(windows.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < windows.length) {
      const k = next++;
      const inputs: FrameInput[] = await Promise.all(
        windows[k].map(async (t, j) => ({ frame: k * 100 + j, timeSec: t, imageUrl: await opts.getFrame(t) })),
      );
      results[k] = { ...(await extractWindow(inputs, opts.vision)), frame: k };
      opts.onProgress?.(++done, windows.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.vision.concurrency ?? 8, windows.length) }, worker));
  return results;
}
