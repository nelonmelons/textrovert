// Server-side model source backed by OpenAI structured output. Never import this into the app: it needs an API key,
// and the app sends nothing anywhere. The prompt it sends is exactly makeModelPrompt's: eligible, unseen messages only.

import { wrappedModelKinds, type WrappedModelPrompt, type WrappedModelSource, type WrappedModelSuggestion } from "./model";

export interface OpenAIModelSourceOptions {
  apiKey: string;
  /** Defaults to gpt-5-mini. */
  model?: string;
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
  baseURL?: string;
  fetch?: typeof fetch;
}

const momentsSchema = {
  type: "object",
  properties: {
    moments: {
      type: "array",
      description: "Up to 4 standout moments, referenced by message ids",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: [...wrappedModelKinds], description: "One of the allowed kinds" },
          messageIDs: { type: "array", items: { type: "string" }, description: "Message ids copied exactly from the lines, in time order" },
          headline: { type: "string", description: "At most 6 words" },
          why: { type: "string", description: "One short sentence on why this moment is distinctive" },
          sensitive: { type: "boolean", description: "True for conflict, hurt feelings, health, money, private details, or mocking someone" },
        },
        required: ["kind", "messageIDs", "headline", "why", "sensitive"],
        additionalProperties: false,
      },
    },
  },
  required: ["moments"],
  additionalProperties: false,
} as const;

export function openAIModelSource(options: OpenAIModelSourceOptions): WrappedModelSource {
  const { apiKey, model = "gpt-5-mini", reasoningEffort = "low", baseURL = "https://api.openai.com/v1" } = options;
  const doFetch = options.fetch ?? fetch;

  const respond = async (prompt: WrappedModelPrompt, chunk: string, signal?: AbortSignal): Promise<WrappedModelSuggestion[]> => {
    const res = await doFetch(baseURL + "/chat/completions", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: "Bearer " + apiKey },
      body: JSON.stringify({
        model,
        ...(/^(gpt-5|o\d)/.test(model) ? { reasoning_effort: reasoningEffort } : {}),
        messages: [
          { role: "system", content: prompt.instructions },
          { role: "user", content: chunk },
        ],
        response_format: { type: "json_schema", json_schema: { name: "wrapped_moments", strict: true, schema: momentsSchema } },
      }),
    });
    if (!res.ok) throw new Error("Wrapped model request failed: " + res.status + " " + (await res.text()).slice(0, 300));
    const json = (await res.json()) as { choices: { message: { content: string | null; refusal?: string | null } }[] };
    const message = json.choices[0]?.message;
    if (!message?.content) throw new Error("Wrapped model returned no content" + (message?.refusal ? ": " + message.refusal : ""));
    const parsed = JSON.parse(message.content) as { moments: WrappedModelSuggestion[] };
    return parsed.moments.slice(0, 4);
  };

  return {
    async suggestions(prompt, signal) {
      const perChunk = await Promise.all(prompt.chunks.map((chunk) => respond(prompt, chunk, signal)));
      return perChunk.flat();
    },
  };
}
