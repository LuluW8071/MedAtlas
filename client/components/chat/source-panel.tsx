"use client";

import { ChevronDown, FileText, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Citation } from "@/lib/types";
import { Markdown } from "./markdown";

export function SourcePanel({
  sources,
  focusIndex,
  onClose,
}: {
  sources: Citation[];
  focusIndex: number;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(() => new Set([focusIndex]));
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    setOpen((current) => new Set(current).add(focusIndex));
    refs.current[focusIndex]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusIndex]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (index: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(index)) next.add(index);
      return next;
    });

  return (
    <aside className="animate-source-from-right fixed inset-y-0 right-0 z-[100] flex w-full flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 sm:w-[30rem] lg:static lg:z-10 lg:shrink-0 lg:self-stretch lg:shadow-none">
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-zinc-800">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <FileText className="h-4 w-4 text-[#1d76bc] dark:text-sky-300" />
          Sources
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#e9f3fc] px-1.5 text-xs font-semibold text-[#1d76bc] dark:bg-[#1d76bc]/20 dark:text-sky-300">
            {sources.length}
          </span>
        </h2>
        <button type="button" onClick={onClose} aria-label="Close sources" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto py-2">
        {sources.map((source, index) => (
          <div
            key={source.id}
            ref={(element) => {
              refs.current[index] = element;
            }}
            className="mx-3 my-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60 dark:border-zinc-800 dark:bg-zinc-900/40"
          >
            <button type="button" onClick={() => toggle(index)} aria-expanded={open.has(index)} className="flex w-full items-start gap-2.5 px-4 py-3.5 text-left">
              <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-slate-500 transition-transform dark:text-zinc-400 ${open.has(index) ? "" : "-rotate-90"}`} />
              <span className="min-w-0 flex-1 truncate text-base font-semibold text-[#1d76bc] dark:text-sky-300" title={source.topic}>
                {index + 1}. {source.topic}
              </span>
              <span className="shrink-0 self-center border-l border-slate-300 pl-2.5 text-xs font-medium tabular-nums text-[#1d76bc] dark:border-zinc-700 dark:text-sky-300">
                {source.score.toFixed(3)}
              </span>
            </button>
            {open.has(index) && (
              <div className="border-t border-slate-200 bg-white px-4 pt-4 pb-5 text-slate-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                {source.subheadings.length > 0 && (
                  <p className="mb-3 text-sm text-slate-500 dark:text-zinc-400">{source.subheadings.join(" > ")}</p>
                )}
                <Markdown text={source.text} />
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
