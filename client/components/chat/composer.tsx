"use client";

import { ArrowUp } from "lucide-react";
import { useLayoutEffect, useRef } from "react";

export function Composer({
  input,
  loading,
  onInputChange,
  onSend,
}: {
  input: string;
  loading: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.max(40, Math.min(textarea.scrollHeight, 128))}px`;
  }, [input]);

  return (
    <form
      className="flex w-full max-w-3xl items-end justify-between gap-3 rounded-3xl bg-white py-2 pl-7 pr-2 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_24px_rgba(0,0,0,0.06)] dark:bg-[#1e1f20]"
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <textarea
        ref={ref}
        rows={1}
        value={input}
        disabled={loading}
        aria-label="Message"
        placeholder="Ask a medical question or book an appointment..."
        onChange={(event) => onInputChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
        className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2 text-base outline-none placeholder:text-slate-400 disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={!input.trim() || loading}
        aria-label="Send message"
        className="mb-1 shrink-0 rounded-full bg-[#1d76bc] p-2 text-white transition hover:bg-[#2185d4] active:scale-95 disabled:opacity-40"
      >
        <ArrowUp className="h-4 w-4" />
      </button>
    </form>
  );
}
