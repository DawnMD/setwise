import { describe, expect, it, vi } from "vitest";

import { memoizeSessionResolver } from "../src";

describe("memoizeSessionResolver", () => {
  it("shares one in-flight authentication lookup across a batch", async () => {
    const resolve = vi.fn(async () => ({ userId: "user-1" }));
    const getPrincipal = memoizeSessionResolver(resolve);

    await expect(Promise.all([getPrincipal(), getPrincipal(), getPrincipal()])).resolves.toEqual([
      { userId: "user-1" },
      { userId: "user-1" },
      { userId: "user-1" },
    ]);
    expect(resolve).toHaveBeenCalledOnce();
  });

  it("memoizes an unauthenticated result too", async () => {
    const resolve = vi.fn(async () => null);
    const getPrincipal = memoizeSessionResolver(resolve);

    await getPrincipal();
    await getPrincipal();

    expect(resolve).toHaveBeenCalledOnce();
  });
});
