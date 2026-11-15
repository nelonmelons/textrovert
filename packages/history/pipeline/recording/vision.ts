import { FRAME_JSON_SCHEMA, FRAME_PROMPT, WINDOW_PROMPT, type FrameExtraction } from "./frames";

export interface VisionOptions {
  apiKey: string;
  model?: string;
}

export interface FrameInput {
  timeSec: number;
  imageUrl: string;
}

const FIELD_RULES = FRAME_PROMPT.split("\n").slice(2).join("\n");

/** Reads consecutive frames of a chat screen recording (or one screenshot) into ordered chat elements. */
export async function readFrames(inputs: FrameInput[], index: number, opts: VisionOptions): Promise<FrameExtraction> {
  const model = opts.model ?? "gpt-5-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify({
      model,
      ...(/^(gpt-5|o\d)/.test(model) ? { reasoning_effort: "minimal" } : {}),
      messages: [
        { role: "system", content: inputs.length === 1 ? FRAME_PROMPT : WINDOW_PROMPT + FIELD_RULES },
        { role: "user", content: inputs.map((i) => ({ type: "image_url", image_url: { url: i.imageUrl, detail: "high" } })) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "chat_frame", strict: true, schema: FRAME_JSON_SCHEMA } },
    }),
  });
  if (!res.ok) throw new Error("Vision request failed: " + res.status + " " + (await res.text()).slice(0, 300));
  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  return { frame: index, timeSec: inputs[0]?.timeSec ?? null, ...JSON.parse(json.choices[0].message.content) };
}

/** Overlapping windows of consecutive frames, so every bubble is seen whole in at least one window. */
export function frameWindows<T>(frames: T[], size = 10, overlap = 2): T[][] {
  const windows: T[][] = [];
  for (let start = 0; start < frames.length; start += size - overlap) {
    windows.push(frames.slice(start, start + size));
    if (start + size >= frames.length) break;
  }
  return windows;
}
