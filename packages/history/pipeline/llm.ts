/** One model call whose answer is JSON matching `schema` (OpenAI structured outputs, strict mode). */
export interface JsonRequest {
  /** Names the schema in the request, e.g. "interests". */
  name: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  /** Reasoning effort for reasoning models; ignored by others. */
  effort?: "minimal" | "low" | "medium" | "high";
}

export type Llm = <T>(request: JsonRequest) => Promise<T>;

export const DEFAULT_MODEL = "gpt-5-mini";

const RETRY_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

/** Chat Completions client with JSON-schema output, retrying rate limits, server errors, and timeouts with backoff. */
export function openAiLlm(options: { apiKey: string; model?: string; baseUrl?: string; attempts?: number; timeoutMs?: number }): Llm {
  const model = options.model || DEFAULT_MODEL;
  const reasoning = /^(gpt-[56]|o\d)/.test(model);
  // "minimal" exists only on the original GPT-5 models; later ones call it "none", and o-series models start at "low".
  const effortFor = (effort: JsonRequest["effort"] = "low") =>
    effort !== "minimal" || /^gpt-5(-mini|-nano)?(-\d{4}-\d\d-\d\d)?$/.test(model) ? effort : /^o\d/.test(model) ? "low" : "none";
  const attempts = options.attempts ?? 6;
  return async <T>(request: JsonRequest): Promise<T> => {
    const body = JSON.stringify({
      model,
      ...(reasoning ? { reasoning_effort: effortFor(request.effort) } : {}),
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
      response_format: { type: "json_schema", json_schema: { name: request.name, strict: true, schema: request.schema } },
    });
    for (let attempt = 1; ; attempt++) {
      let retryAfterMs: number | null = null;
      let failure: Error;
      try {
        const res = await fetch((options.baseUrl ?? "https://api.openai.com/v1") + "/chat/completions", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: "Bearer " + options.apiKey },
          body,
          signal: AbortSignal.timeout(options.timeoutMs ?? 240_000),
        });
        if (res.ok) {
          const json = (await res.json()) as {
            choices: { message: { content: string | null; refusal?: string | null }; finish_reason: string }[];
          };
          const choice = json.choices[0];
          if (choice?.message.refusal) throw new Error("The model declined the " + request.name + " request: " + choice.message.refusal);
          if (!choice?.message.content) throw new RetryableError("The model returned no " + request.name + " output (" + choice?.finish_reason + ")");
          try {
            return JSON.parse(choice.message.content) as T;
          } catch {
            throw new RetryableError("The model returned malformed " + request.name + " output (" + choice.finish_reason + ")");
          }
        }
        const text = await res.text();
        const message = "OpenAI " + request.name + " request failed: HTTP " + res.status + " " + text.slice(0, 300);
        if (!RETRY_STATUS.has(res.status) || /insufficient_quota/.test(text)) throw new Error(message);
        retryAfterMs = retryAfter(res.headers);
        failure = new RetryableError(message);
      } catch (error) {
        const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        const network = error instanceof TypeError;
        if (!(error instanceof RetryableError) && !timedOut && !network) throw error;
        failure = timedOut ? new Error("OpenAI " + request.name + " request timed out") : (error as Error);
      }
      if (attempt >= attempts) throw failure;
      const backoff = Math.min(30_000, 1000 * 2 ** (attempt - 1)) * (0.75 + Math.random() / 2);
      await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfterMs ?? 0, backoff)));
    }
  };
}

class RetryableError extends Error {}

function retryAfter(headers: Headers): number | null {
  const ms = Number(headers.get("retry-after-ms"));
  if (Number.isFinite(ms) && ms > 0) return ms;
  const seconds = Number(headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

/** Runs `fn` over the items with at most `limit` calls in flight, keeping the results in input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
