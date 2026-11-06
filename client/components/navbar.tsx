"use client";

import { ChevronDown, LogOut, Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "./theme-toggle";

export function Navbar({
  email,
  onToggleHistory,
  onNewChat,
  onLogout,
}: {
  email: string;
  onToggleHistory: () => void;
  onNewChat: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (open && !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <header className="relative z-20 w-full border-b border-slate-200/60 bg-white/75 backdrop-blur-md dark:border-zinc-800/60 dark:bg-black/65">
      <div className="mx-auto flex h-16 max-w-[88rem] items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onToggleHistory} aria-label="Toggle chat history" className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
            <Menu className="h-5 w-5" />
          </button>
          <button type="button" onClick={onNewChat} className="text-lg font-bold tracking-tight hover:opacity-75">
            Med<span className="text-[#1d76bc]">Atlas</span>
          </button>
        </div>
        <div ref={ref} className="relative shrink-0">
          <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Open profile menu" className="flex items-center gap-1.5 rounded-full p-1 pr-2 hover:bg-slate-100 dark:hover:bg-zinc-800">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1d76bc] text-sm font-semibold uppercase text-white">{email.charAt(0)}</span>
            <ChevronDown className="h-4 w-4 text-slate-500 dark:text-zinc-400" />
          </button>
          <div className={`absolute right-0 top-12 z-50 w-60 origin-top-right rounded-2xl border border-slate-200 bg-white p-2 shadow-xl transition-all duration-200 dark:border-zinc-800 dark:bg-zinc-950 ${open ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"}`}>
            <div className="border-b border-slate-200 px-3 py-3 dark:border-zinc-800">
              <p className="text-sm text-slate-500 dark:text-zinc-400">Signed in as</p>
              <p className="truncate font-semibold">{email}</p>
            </div>
            <div className="flex items-center justify-between px-3 py-2 text-sm text-slate-600 dark:text-zinc-300">
              <span>Theme</span>
              <ThemeToggle />
            </div>
            <button type="button" onClick={onLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
