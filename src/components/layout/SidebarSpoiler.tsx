"use client";

import { useState } from "react";

import { ChevronDown } from "@/components/icons";
import { cn } from "@/lib/utils";

export function SidebarSpoiler({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2 border-t border-border/70 pt-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        aria-expanded={open}
      >
        <span className="flex-1">{title}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  );
}
