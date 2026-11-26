"use client";

import { MessageCircle, SquarePen } from "lucide-react";
import type { Conversation } from "@/lib/types";

const DAY = 24 * 60 * 60 * 1000;

function group(updatedAt: number) {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const days = Math.floor((startOfToday - new Date(updatedAt).setHours(0, 0, 0, 0)) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= 7) return "Previous 7 Days";
  if (days <= 30) return "Previous 30 Days";
  return "Older";
}

const ORDER = ["Today", "Yesterday", "Previous 7 Days", "Previous 30 Days", "Older"];

export function ConversationHistory({
  open,
  conversations,
  activeId,
  onSelect,
  onNew,
  onClose,
}: {
  open: boolean;
  conversations: Conversation[];
  activeId: string;
  onSelect: (conversation: Conversation) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden" onClick={onClose} role="presentation" />}
      <aside
        aria-label="Conversation history"
        inert={!open}
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white shadow-xl transition-transform duration-300 dark:border-zinc-800 dark:bg-zinc-950 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-4 py-5">
          <span className="text-lg font-bold tracking-tight">Med<span className="text-[#1d76bc]">Atlas</span></span>
          <button type="button" onClick={onNew} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-[#1d76bc] hover:bg-[#e9f3fc] dark:text-sky-300 dark:hover:bg-[#1d76bc]/15">
            <SquarePen className="h-4 w-4" /> New chat
          </button>
        </div>
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {sorted.length === 0 && <p className="px-3 py-2 text-sm text-slate-500 dark:text-zinc-400">No conversations yet.</p>}
          {ORDER.map((label) => {
            const items = sorted.filter((conversation) => group(conversation.updatedAt) === label);
            return items.length === 0 ? null : (
              <section key={label} className="mb-3">
                <h3 className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</h3>
                {items.map((conversation) => (
                  <button
                    key={conversation.threadId}
                    type="button"
                    onClick={() => onSelect(conversation)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                      conversation.threadId === activeId
                        ? "bg-[#e9f3fc] text-[#1d76bc] dark:bg-[#1d76bc]/20 dark:text-sky-300"
                        : "text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <MessageCircle className="h-4 w-4 shrink-0" />
                    <span className="truncate">{conversation.title}</span>
                  </button>
                ))}
              </section>
            );
          })}
        </div>
      </aside>
    </>
  );
}
