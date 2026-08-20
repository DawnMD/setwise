"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isDefinedError } from "@orpc/client";
import * as React from "react";

import { formatWeight, formatWhen } from "@/lib/format";
import { orpc } from "@/lib/orpc";
import { uuidv7 } from "@/lib/uuid";
import { Button } from "@/components/ui/button";

import { Elapsed } from "./elapsed";

/**
 * The screen the app opens on.
 *
 * One decision: start, or carry on. Everything else here is history, and it is
 * history rather than statistics because the stats screen is phase 3 and a
 * half-built version of it would be worse than none.
 */
export function TrainHome() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);

  const active = useQuery(orpc.session.active.queryOptions({ staleTime: 0 }));
  const recent = useQuery(orpc.session.recent.queryOptions({ input: { limit: 10 } }));

  const start = useMutation(
    orpc.session.start.mutationOptions({
      onSuccess: (session) => router.push(`/train/${session.id}`),
      onError: (mutationError) => {
        // A typed error, matched rather than string-parsed: if a workout is
        // already open, the only sensible thing is to go to it.
        if (isDefinedError(mutationError) && mutationError.code === "SESSION_ALREADY_ACTIVE") {
          router.push(`/train/${mutationError.data.sessionId}`);
          return;
        }
        setError("Couldn't start a workout. Check your connection and try again.");
      },
    }),
  );

  return (
    <div className="mx-auto w-full max-w-[520px] px-4 py-4">
      <header className="flex items-baseline justify-between py-2">
        <h1 className="text-2xl font-semibold tracking-tight">Setwise</h1>
        <Link href="/settings" className="text-sm text-ink-muted underline underline-offset-4">
          Settings
        </Link>
      </header>

      {active.data ? (
        <section className="mt-4 rounded-xl border border-accent/40 bg-accent/5 p-4">
          <h2 className="text-sm font-semibold">Workout in progress</h2>
          <p className="numeric mt-0.5 text-xs text-ink-muted">
            Started {formatWhen(new Date(active.data.startedAt)).toLowerCase()} ·{" "}
            <Elapsed since={active.data.startedAt} /> in
          </p>
          <Link
            href={`/train/${active.data.id}`}
            className="mt-3 flex h-14 w-full items-center justify-center rounded-lg bg-accent text-base font-medium text-accent-ink"
          >
            Carry on
          </Link>
        </section>
      ) : (
        <section className="mt-4">
          <Button
            size="lg"
            className="w-full"
            disabled={start.isPending || active.isPending}
            onClick={() => {
              setError(null);
              start.mutate({ id: uuidv7(), routineDayId: null, notes: null });
            }}
          >
            {start.isPending ? "Starting…" : "Start workout"}
          </Button>
          {error ? (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Recent workouts</h2>

        {recent.isPending ? (
          <p className="mt-3 text-sm text-ink-muted">Loading…</p>
        ) : recent.isError ? (
          <p className="mt-3 text-sm text-danger">
            Couldn&apos;t load your history. Pull down to try again.
          </p>
        ) : recent.data.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">
            No workouts yet. Start one and it will show up here.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {recent.data.map((session) => (
              <li key={session.id}>
                <Link
                  href={`/train/${session.id}`}
                  className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border bg-surface-raised px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block text-[15px]">
                      {formatWhen(new Date(session.startedAt))}
                      {session.endedAt === null ? " · unfinished" : ""}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">
                      {session.exerciseNames.length > 0
                        ? session.exerciseNames.slice(0, 3).join(", ")
                        : "No sets logged"}
                    </span>
                  </span>
                  <span className="numeric shrink-0 text-right text-xs text-ink-muted">
                    <span className="block">{session.workingSetCount} sets</span>
                    <span className="block">{formatWeight(Math.round(session.tonnage))} kg</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
