import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";

import { hasOwnHistory, matchError, parseBody, readCode, readMatchId, readName } from "../assistant/matchRequests";
import { ApiError } from "../assistant/requests";

const fails = (fn: () => unknown, status: number) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(status);
    return (error as ApiError).message;
  }
  throw new Error("expected an ApiError");
};

describe("match requests", () => {
  it("parses JSON object bodies only", () => {
    expect(parseBody('{"name":"Emma"}')).toEqual({ name: "Emma" });
    expect(parseBody("")).toEqual({});
    fails(() => parseBody("[]"), 400);
    fails(() => parseBody("nope"), 400);
    fails(() => parseBody("x".repeat(10_001)), 413);
  });

  it("needs a name and trims it to 40 characters", () => {
    expect(readName({ name: "  Emma  " })).toBe("Emma");
    expect(readName({ name: "x".repeat(60) })).toHaveLength(40);
    expect(fails(() => readName({ name: "   " }), 400)).toMatch(/name/);
    fails(() => readName({}), 400);
  });

  it("normalizes invite codes the way people type them", () => {
    expect(readCode({ code: "mzp62x" })).toBe("MZP62X");
    expect(readCode({ code: " mzp-62x " })).toBe("MZP62X");
    expect(readCode({ code: "MZP 62X" })).toBe("MZP62X");
    fails(() => readCode({ code: "MZP62" }), 400);
    fails(() => readCode({ code: "MZP62XY" }), 400);
    fails(() => readCode({ code: "MZP!2X" }), 400);
    fails(() => readCode({}), 400);
  });

  it("needs a match id", () => {
    expect(readMatchId(" abc ")).toBe("abc");
    fails(() => readMatchId(""), 400);
    fails(() => readMatchId(undefined), 400);
    fails(() => readMatchId("x".repeat(65)), 400);
  });

  it("counts any upload that hasn't failed as the account's own history", () => {
    expect(hasOwnHistory([])).toBe(false);
    expect(hasOwnHistory([{ status: "failed" }])).toBe(false);
    expect(hasOwnHistory([{ status: "failed" }, { status: "parsing" }])).toBe(true);
    expect(hasOwnHistory([{ status: "done" }])).toBe(true);
  });

  it("maps matching errors to responses", () => {
    expect(matchError(new ConvexError("No invite has that code."))).toMatchObject({ status: 400, message: "No invite has that code." });
    expect(matchError(new ConvexError("Match not found."))).toMatchObject({ status: 404 });
    expect(matchError(new Error('ArgumentValidationError: Value does not match validator. Path: .matchId'))).toMatchObject({ status: 404 });
    expect(matchError(new Error("socket hang up"))).toMatchObject({ status: 500 });
    const passthrough = new ApiError(409, "x");
    expect(matchError(passthrough)).toBe(passthrough);
  });
});
