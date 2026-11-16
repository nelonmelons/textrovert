import { ApiError } from "./requests";

/**
 * Request parsing for the phone's matching routes in convex/http.ts (/matches, /matches/join, /match, /match/rerun,
 * /match/remove). The routes only wrap convex/matches.ts; everything here is plain so it can be tested without Convex.
 */

export const INVITE_CODE_LENGTH = 6;
const NAME_MAX = 40;
const ID_MAX = 64;

/** Parses a JSON object body; anything else is a 400. */
export function parseBody(raw: string): Record<string, unknown> {
  if (raw.length > 10_000) throw new ApiError(413, "Request too large");
  let body: unknown;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    throw new ApiError(400, "Body must be a JSON object");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "Body must be a JSON object");
  return body as Record<string, unknown>;
}

/** The name the other person knows you by, as matches.create and matches.join take it. */
export function readName(body: Record<string, unknown>): string {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw new ApiError(400, "Add the name the other person knows you by.");
  return name.slice(0, NAME_MAX);
}

/** An invite code as people type it: case, spaces and dashes don't matter. */
export function readCode(body: Record<string, unknown>): string {
  const code = typeof body.code === "string" ? body.code.toUpperCase().replace(/[\s-]/g, "") : "";
  if (!new RegExp(`^[A-Z0-9]{${INVITE_CODE_LENGTH}}$`).test(code)) {
    throw new ApiError(400, `Enter the ${INVITE_CODE_LENGTH}-character invite code you were sent.`);
  }
  return code;
}

export function readMatchId(value: unknown): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id || id.length > ID_MAX) throw new ApiError(400, "matchId is required");
  return id;
}

/**
 * Whether the account has its own history to compare: any upload that hasn't failed (one still processing counts;
 * the comparison waits for it). Matching is only for two people who have each uploaded and opted in.
 */
export function hasOwnHistory(uploads: { status: string }[]): boolean {
  return uploads.some((upload) => upload.status !== "failed");
}

export const NEEDS_UPLOAD = "Upload your own chats before comparing. Matching only works between two people who have each uploaded theirs.";

/**
 * Turns an error from a matches.* call into a response. ConvexErrors carry a message meant for people ("No invite has
 * that code."); a malformed match id fails argument validation, which is the same as not finding the match.
 */
export function matchError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const data = (error as { data?: unknown } | null)?.data;
  if (typeof data === "string" && data) return new ApiError(data === "Match not found." ? 404 : 400, data);
  const message = error instanceof Error ? error.message : "";
  if (/validator|ArgumentValidationError|Invalid argument/i.test(message)) return new ApiError(404, "Match not found.");
  return new ApiError(500, "Couldn't reach matching. Try again.");
}
