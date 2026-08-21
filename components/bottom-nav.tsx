import { Link, useRouterState } from "@tanstack/react-router";
import { CalendarDays, ChartNoAxesColumn, Dumbbell, Scale } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Four items, because that is genuinely the count of things this app does, not
 * because four looks tidy. Bottom-anchored: everything a thumb reaches lives in
 * the bottom third, and there is never a top-right save button.
 *
 * Body earned a tab in phase 5. Weighing in is a daily act, and it was buried
 * under a heatmap at the bottom of Progress.
 */
const ITEMS = [
  { to: "/train", label: "Train", icon: Dumbbell },
  { to: "/progress", label: "Progress", icon: ChartNoAxesColumn },
  { to: "/body", label: "Body", icon: Scale },
  { to: "/plan", label: "Plan", icon: CalendarDays },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-20 border-t bg-card pb-[env(safe-area-inset-bottom,0px)]"
    >
      <ul className="mx-auto flex w-full max-w-[520px]">
        {ITEMS.map((item) => {
          const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
          return (
            <li key={item.to} className="flex-1">
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <item.icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
