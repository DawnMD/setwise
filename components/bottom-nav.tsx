"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

/**
 * Three items, because that is genuinely the count of things this app does, not
 * because three looks tidy. Bottom-anchored: everything a thumb reaches lives
 * in the bottom third, and there is never a top-right save button.
 */
const ITEMS = [
  { href: "/train", label: "Train" },
  { href: "/progress", label: "Progress" },
  { href: "/plan", label: "Plan" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-20 border-t border-border bg-surface-raised pb-[env(safe-area-inset-bottom,0px)]"
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
                  "flex h-14 items-center justify-center text-sm font-medium",
                  active ? "text-accent" : "text-ink-muted",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
