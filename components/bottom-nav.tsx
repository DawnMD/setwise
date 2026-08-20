"use client";

import { CalendarDays, ChartNoAxesColumn, Dumbbell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Three items, because that is genuinely the count of things this app does, not
 * because three looks tidy. Bottom-anchored: everything a thumb reaches lives
 * in the bottom third, and there is never a top-right save button.
 */
const ITEMS = [
  { href: "/train", label: "Train", icon: Dumbbell },
  { href: "/progress", label: "Progress", icon: ChartNoAxesColumn },
  { href: "/plan", label: "Plan", icon: CalendarDays },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-20 border-t bg-card pb-[env(safe-area-inset-bottom,0px)]"
    >
      <ul className="mx-auto flex w-full max-w-[520px]">
        {ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
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
