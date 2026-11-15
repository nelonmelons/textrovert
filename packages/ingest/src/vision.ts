import { FRAME_JSON_SCHEMA, FRAME_PROMPT, WINDOW_PROMPT, type FrameExtraction } from "./screenshots.ts";

export interface VisionOptions {
  apiKey: string;
  model?: string;
  concurrency?: number;
  baseUrl?: string;
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
  onProgress?: (done: number, total: number) => void;
}

export interface FrameInput {
  frame: number;
  timeSec: number | null;
  imageUrl: string;
}

export function extractFrame(input: FrameInput, opts: VisionOptions): Promise<FrameExtraction> {
  return extractWindow([input], opts);
}

export async function extractWindow(inputs: FrameInput[], opts: VisionOptions): Promise<FrameExtraction> {
  const input = inputs[0];
  const prompt = inputs.length === 1 ? FRAME_PROMPT : WINDOW_PROMPT + FRAME_PROMPT.split("\n").slice(2).join("\n");
  const model = opts.model ?? "gpt-5-mini";
  const reasoning = /^(gpt-5|o\d)/.test(model) ? { reasoning_effort: opts.reasoningEffort ?? "minimal" } : {};
  const res = await fetch(`${opts.baseUrl ?? "https://api.openai.com/v1"}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify({
      model,
      ...reasoning,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: inputs.map((i) => ({ type: "image_url", image_url: { url: i.imageUrl, detail: "high" } })) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "chat_frame", strict: true, schema: FRAME_JSON_SCHEMA } },
    }),
  });
  if (!res.ok) throw new Error(`Vision request for frame ${input.frame} failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  const parsed = JSON.parse(json.choices[0].message.content);
  return { frame: input.frame, timeSec: input.timeSec, ...parsed };
}

export async function extractFrames(inputs: FrameInput[], opts: VisionOptions): Promise<FrameExtraction[]> {
  const results: FrameExtraction[] = new Array(inputs.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < inputs.length) {
      const k = next++;
      results[k] = await extractFrame(inputs[k], opts);
      opts.onProgress?.(++done, inputs.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 16, inputs.length) }, worker));
  return results;
}
