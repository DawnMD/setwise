import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import { isTransportError, isUnauthorized } from "../src";

describe("API error classification", () => {
  it("classifies authorization independently from connectivity", () => {
    const error = new ORPCError("UNAUTHORIZED", { defined: true });

    expect(isUnauthorized(error)).toBe(true);
    expect(isTransportError(error)).toBe(false);
  });

  it("recognizes fetch and gateway failures as transport errors", () => {
    expect(isTransportError(new TypeError("fetch failed"))).toBe(true);
    expect(isTransportError(new ORPCError("BAD_GATEWAY"))).toBe(true);
  });

  it("does not retry named domain errors as transport failures", () => {
    expect(isTransportError(new ORPCError("SESSION_FINISHED", { defined: true }))).toBe(false);
  });
});
