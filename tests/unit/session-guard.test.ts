import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolved = vi.hoisted(() => ({ calls: 0, session: null as unknown }));

// The guard's only outside dependency is the server function that resolves the
// session. Counting its calls is the whole of what this file asserts.
vi.mock("../../src/server/session.functions", () => ({
  getCurrentSession: vi.fn(async () => {
    resolved.calls += 1;
    return resolved.session;
  }),
}));

const { authSessionQuery } = await import("../../lib/session-query");
const { clearAccountCache } = await import("../../lib/cache");
const { STALE } = await import("../../lib/stale");

describe("authenticated route guard", () => {
  beforeEach(() => {
    resolved.calls = 0;
    resolved.session = { user: { id: "someone" } };
    vi.useRealTimers();
  });

  it("resolves the session once for navigations inside the freshness window", async () => {
    const client = new QueryClient();

    // Four tabs on the bottom nav. Each one runs `beforeLoad`.
    await client.ensureQueryData(authSessionQuery);
    await client.ensureQueryData(authSessionQuery);
    await client.ensureQueryData(authSessionQuery);
    await client.ensureQueryData(authSessionQuery);

    expect(resolved.calls).toBe(1);
  });

  it("asks the server again once the window has passed", async () => {
    const client = new QueryClient();
    await client.ensureQueryData(authSessionQuery);
    expect(resolved.calls).toBe(1);

    // Age the cached answer past its staleness rather than waiting five minutes.
    const entry = client.getQueryCache().find({ queryKey: authSessionQuery.queryKey });
    expect(entry).toBeDefined();
    entry!.state.dataUpdatedAt = Date.now() - STALE.authRoute - 1;

    // The navigation still commits on the cached session; the re-resolution
    // happens behind it, so the next one is answered from a fresh reading.
    await client.ensureQueryData(authSessionQuery);
    await vi.waitFor(() => expect(resolved.calls).toBe(2));
  });

  it("stops trusting the cached session the moment the account cache is cleared", async () => {
    const client = new QueryClient();
    await client.ensureQueryData(authSessionQuery);
    expect(resolved.calls).toBe(1);

    // What signing out does. The next protected route has to ask the server,
    // and by then the cookie is gone — which is what makes sign-out immediate
    // rather than something the five-minute window can outlive.
    clearAccountCache(client);
    resolved.session = null;

    const session = await client.ensureQueryData(authSessionQuery);
    expect(resolved.calls).toBe(2);
    expect(session).toBeNull();
  });
});
