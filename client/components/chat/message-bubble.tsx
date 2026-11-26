"use client";

import { Check, Copy, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import type { Citation, Message } from "@/lib/types";
import { Markdown } from "./markdown";

const iconButton =
  "rounded-full p-1 transition-all hover:bg-slate-100 hover:text-slate-700 active:scale-95 dark:hover:bg-zinc-800/60 dark:hover:text-slate-200";

export function MessageBubble({
  message,
  isStreaming,
  onOpenSource,
}: {
  message: Message;
  isStreaming: boolean;
  onOpenSource: (citations: Citation[], index: number) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"like" | "dislike" | null>(null);

  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end animate-slide-up">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-3xl bg-[#282a2c] px-5 py-2.5 text-[15px] leading-relaxed text-white">
          {message.content}
        </div>
      </div>
    );
  }

  const citations = message.citations ?? [];
  const toggle = (value: "like" | "dislike") => setFeedback((current) => (current === value ? null : value));

  return (
    <div className="w-full max-w-[90%] space-y-3 animate-slide-up">
      {!message.content ? (
        <div role="status" aria-label="Assistant is thinking" className="flex items-center gap-2 text-sm text-slate-500 dark:text-zinc-400">
          <span className="animate-pulse">Thinking...</span>
        </div>
      ) : (
        <>
          <Markdown text={message.content} />
          {!isStreaming && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-400 dark:text-slate-500 sm:gap-3">
              <button type="button" className={`${iconButton} ${feedback === "like" ? "text-emerald-500" : ""}`} onClick={() => toggle("like")} aria-label="Like response" title="Good response">
                <ThumbsUp className="h-4 w-4" fill={feedback === "like" ? "currentColor" : "none"} />
              </button>
              <button type="button" className={`${iconButton} ${feedback === "dislike" ? "text-rose-500" : ""}`} onClick={() => toggle("dislike")} aria-label="Dislike response" title="Bad response">
                <ThumbsDown className="h-4 w-4" fill={feedback === "dislike" ? "currentColor" : "none"} />
              </button>
              <button
                type="button"
                className={iconButton}
                title="Copy response"
                aria-label="Copy response"
                onClick={() => {
                  void navigator.clipboard.writeText(message.content);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </button>
              {citations.length > 0 && (
                <div className="flex flex-wrap gap-1.5" aria-label="Retrieved sources">
                  {citations.map((citation, index) => (
                    <button
                      key={citation.id}
                      type="button"
                      onClick={() => onOpenSource(citations, index)}
                      title="Open retrieved source"
                      className="flex max-w-56 items-center gap-1.5 rounded-full bg-[#e9f3fc] px-2.5 py-1 text-[#1d76bc] transition hover:bg-[#d9ebf9] dark:bg-[#1d76bc]/20 dark:text-sky-300"
                    >
                      <span className="font-semibold">{index + 1}</span>
                      <span className="truncate">{citation.topic}</span>
                      <small className="opacity-70">{citation.score.toFixed(3)}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
