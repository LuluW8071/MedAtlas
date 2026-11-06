"use client";

import { useCallback, useState } from "react";
import { apiUrl, type Citation, type Conversation, type Message } from "@/lib/types";

export function makeId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

async function readAgentStream(
  response: Response,
  onToken: (token: string) => void,
  onCitations: (citations: Citation[]) => void,
  onSuggestions: (suggestions: string[]) => void,
): Promise<void> {
  if (!response.body) throw new Error("Agent returned no response stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedToken = false;

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";

    for (const event of events) {
      const eventType = event.match(/^event:\s*(.+)$/m)?.[1] ?? "message";
      const dataLine = event.match(/^data:\s*(.+)$/m)?.[1];
      if (!dataLine) continue;

      const payload = JSON.parse(dataLine) as {
        token?: string;
        response?: string;
        error?: string;
        citations?: Citation[];
        suggestions?: string[];
      };
      if (eventType === "token" && payload.token) {
        receivedToken = true;
        onToken(payload.token);
      }
      if (eventType === "error") throw new Error(payload.error ?? "Agent could not answer.");
      if ((eventType === "sources" || eventType === "done") && payload.citations) {
        onCitations(payload.citations);
      }
      if ((eventType === "suggestions" || eventType === "done") && payload.suggestions?.length) {
        onSuggestions(payload.suggestions);
      }
      if (eventType === "done" && payload.response && !receivedToken) {
        onToken(payload.response);
      }
    }

    if (done) break;
  }
}

export function useAgentChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [threadId, setThreadId] = useState(makeId);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const refreshConversations = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/conversations`, { credentials: "include" });
      const data = (await response.json()) as { conversations?: Conversation[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not load conversations.");
      setConversations(data.conversations ?? []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load conversations.");
    }
  }, []);

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || loading) return;

    setInput("");
    setError("");
    setSuggestions([]);
    setLoading(true);
    const assistantId = makeId();
    const patch = (change: (item: Message) => Message) =>
      setMessages((current) => current.map((item) => (item.id === assistantId ? change(item) : item)));
    setMessages((current) => [
      ...current,
      { id: makeId(), role: "user", content: message },
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      const response = await fetch(`${apiUrl}/agent/invoke`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, threadId }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Agent could not answer.");
      }
      await readAgentStream(
        response,
        (token) => patch((item) => ({ ...item, content: item.content + token })),
        (citations) => patch((item) => ({ ...item, citations })),
        setSuggestions,
      );
      void refreshConversations();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Connection failed.");
    } finally {
      setLoading(false);
    }
  }

  function newChat() {
    setMessages([]);
    setSuggestions([]);
    setThreadId(makeId());
    setInput("");
    setError("");
  }

  function openConversation(conversation: Conversation) {
    setMessages(conversation.messages);
    setSuggestions([]);
    setThreadId(conversation.threadId);
    setError("");
  }

  return {
    messages, input, setInput, loading, error, suggestions, threadId,
    conversations, refreshConversations, send, newChat, openConversation,
  };
}
