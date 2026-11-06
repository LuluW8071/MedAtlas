"use client";

import { useEffect, useRef, useState } from "react";
import { Navbar } from "@/components/navbar";
import { useAgentChat } from "@/hooks/use-agent-chat";
import type { Citation } from "@/lib/types";
import { Composer } from "./composer";
import { ConversationHistory } from "./conversation-history";
import { MessageBubble } from "./message-bubble";
import { SourcePanel } from "./source-panel";

const starterPrompts = [
  { label: "Book an appointment", text: "I'd like to book an appointment." },
  { label: "Reschedule or cancel", text: "I need to reschedule or cancel my appointment." },
  { label: "Ask about a condition", text: "What are the common symptoms of diabetes?" },
];

const chip =
  "rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:border-[#1d76bc] hover:text-[#1d76bc] disabled:opacity-50 dark:border-zinc-700 dark:bg-[#1e1f20] dark:text-zinc-200 dark:hover:text-sky-300";

export function ChatShell({ email, onLogout }: { email: string; onLogout: () => void }) {
  const chat = useAgentChat();
  const { messages, loading, suggestions, refreshConversations } = chat;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [panel, setPanel] = useState<{ sources: Citation[]; index: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasStarted = messages.length > 0;

  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const newChat = () => {
    chat.newChat();
    setPanel(null);
    setHistoryOpen(false);
  };

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-white dark:bg-black">
      <Navbar email={email} onToggleHistory={() => setHistoryOpen((open) => !open)} onNewChat={newChat} onLogout={onLogout} />
      <ConversationHistory
        open={historyOpen}
        conversations={chat.conversations}
        activeId={chat.threadId}
        onClose={() => setHistoryOpen(false)}
        onNew={newChat}
        onSelect={(conversation) => {
          chat.openConversation(conversation);
          setPanel(null);
          setHistoryOpen(false);
        }}
      />
      <main className="relative z-10 flex min-h-0 flex-1" aria-label="Chat with MedAtlas">
        <div className="relative mx-auto flex min-h-0 min-w-0 w-full max-w-[54rem] flex-1 flex-col animate-scale-in">
          {!hasStarted && (
            <div className="pointer-events-none absolute left-1/2 top-[45%] z-0 hidden h-[650px] w-[1100px] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(ellipse_75%_65%_at_50%_50%,rgba(29,118,188,0.5)_0%,rgba(15,55,125,0.26)_42%,rgba(6,20,50,0.08)_60%,transparent_72%)] dark:block" />
          )}
          {hasStarted && (
            <div className="thin-scrollbar z-10 min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pt-12 pb-6">
              {messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isStreaming={loading && index === messages.length - 1}
                  onOpenSource={(sources, sourceIndex) => setPanel({ sources, index: sourceIndex })}
                />
              ))}
              {!loading && suggestions[0] && (
                <div className="max-w-[90%] border-t border-slate-200 pt-2 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => void chat.send(suggestions[0])}
                    className="w-full cursor-pointer px-0.5 text-left text-sm leading-relaxed text-[#1d76bc] transition hover:text-[#2185d4] dark:text-sky-300 dark:hover:text-sky-200"
                    aria-label="Ask follow-up question"
                  >
                    {suggestions[0]}
                  </button>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
          <div
            className={`relative z-20 flex flex-col items-center justify-center px-4 ${
              hasStarted ? "shrink-0 pt-3 pb-8 sm:pb-12" : "flex-1 -translate-y-14 sm:-translate-y-20"
            }`}
          >
            {!hasStarted && (
              <>
                <h1 className="mb-8 text-center text-2xl font-normal tracking-tight sm:text-3xl">What can I help with?</h1>
                <div className="mb-6 flex flex-wrap justify-center gap-2">
                  {starterPrompts.map((prompt) => (
                    <button key={prompt.label} type="button" className={chip} disabled={loading} onClick={() => void chat.send(prompt.text)}>
                      {prompt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            <Composer input={chat.input} loading={loading} onInputChange={chat.setInput} onSend={() => void chat.send()} />
            {chat.error && (
              <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">{chat.error}</p>
            )}
            <p className="mt-3 text-center text-xs text-slate-400 dark:text-zinc-500">
              MedAtlas can make mistakes. Verify important clinical information.
            </p>
          </div>
        </div>
        {panel && <SourcePanel key={panel.sources.map((source) => source.id).join("|")} sources={panel.sources} focusIndex={panel.index} onClose={() => setPanel(null)} />}
      </main>
    </div>
  );
}
