"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, ThumbsDown, ThumbsUp } from "lucide-react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
};

type Citation = {
  id: string;
  score: number;
  text: string;
  topic: string;
  subheadings: string[];
  parts: number;
};

type Conversation = {
  threadId: string;
  title: string;
  updatedAt: number;
  messages: Message[];
};

const markdownComponents: Components = {
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="markdown-table">
      <table>{children}</table>
    </div>
  ),
  code: ({ className, children, ...props }) => {
    const inline =
      !className && typeof children === "string" && !children.includes("\n");
    return inline ? (
      <code className="inline-code" {...props}>
        {children}
      </code>
    ) : (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="markdown-code">{children}</pre>,
};

function makeId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

async function readAgentStream(
  response: Response,
  onToken: (token: string) => void,
  onCitations: (citations: Citation[]) => void,
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
      };
      if (eventType === "token" && payload.token) {
        receivedToken = true;
        onToken(payload.token);
      }
      if (eventType === "error") throw new Error(payload.error ?? "Agent could not answer.");
      if ((eventType === "sources" || eventType === "done") && payload.citations) {
        onCitations(payload.citations);
      }
      if (eventType === "done" && payload.response && !receivedToken) {
        onToken(payload.response);
      }
    }

    if (done) break;
  }
}

export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [threadId, setThreadId] = useState(makeId);
  const [userId, setUserId] = useState("");
  const [userIdDraft, setUserIdDraft] = useState("");
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsOpen, setConversationsOpen] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, "like" | "dislike">>(
    {},
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<{
    citations: Citation[];
    index: number;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 28), 140)}px`;
  }, [input]);

  useEffect(() => {
    if (!selectedCitation) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedCitation(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedCitation]);

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const message = input.trim();
    if (!message || loading) return;

    setInput("");
    setError("");
    setLoading(true);
    const assistantId = makeId();
    setMessages((current) => [
      ...current,
      { id: makeId(), role: "user", content: message },
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      const response = await fetch(`${apiUrl}/agent/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          threadId,
          userId: userId || undefined,
        }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Agent could not answer.");
      }

      await readAgentStream(response, (token) => {
        setMessages((current) => current.map((item) => (
          item.id === assistantId
            ? { ...item, content: item.content + token }
            : item
        )));
      }, (citations) => {
        setMessages((current) => current.map((item) => (
          item.id === assistantId ? { ...item, citations } : item
        )));
      });
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Connection failed.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function startNewChat() {
    setMessages([]);
    setThreadId(makeId());
    setInput("");
    setError("");
    setFeedback({});
    setCopiedId(null);
    setSelectedCitation(null);
  }

  async function loadConversations(event: FormEvent) {
    event.preventDefault();
    const nextUserId = userIdDraft.trim();
    if (!nextUserId) return;
    setError("");
    try {
      const response = await fetch(
        `${apiUrl}/conversations?userId=${encodeURIComponent(nextUserId)}`,
      );
      const data = (await response.json()) as {
        conversations?: Conversation[];
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error ?? "Could not load conversations.");
      setUserId(nextUserId);
      setConversations(data.conversations ?? []);
      setUserModalOpen(false);
      setConversationsOpen(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not load conversations.",
      );
    }
  }

  async function copyResponse(message: Message) {
    await navigator.clipboard.writeText(message.content);
    setCopiedId(message.id);
    window.setTimeout(() => setCopiedId(null), 2000);
  }

  function toggleFeedback(messageId: string, value: "like" | "dislike") {
    setFeedback((current) => {
      const next = { ...current };
      if (next[messageId] === value) delete next[messageId];
      else next[messageId] = value;
      return next;
    });
  }

  const hasStarted = messages.length > 0;

  return (
    <main className={`chat-app ${hasStarted ? "has-messages" : ""}`}>
      <header className="navbar">
        <div className="navbar-inner">
          <button className="navbar-title" type="button" onClick={startNewChat}>
            MedAtlas
          </button>
          <div className="navbar-actions">
            <button
              className="user-button"
              type="button"
              onClick={() => setUserModalOpen(true)}
            >
              {userId ? `User: ${userId}` : "Load conversations"}
            </button>
            <button className="new-chat" type="button" onClick={startNewChat}>
              <span aria-hidden="true">+</span> New chat
            </button>
          </div>
        </div>
      </header>
      {userModalOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setUserModalOpen(false);
          }}
        >
          <form className="user-modal" onSubmit={loadConversations}>
            <div className="modal-heading">
              <div>
                <p className="modal-kicker">CONVERSATION HISTORY</p>
                <h2>Load your chats</h2>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={() => setUserModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <label htmlFor="user-id">User ID</label>
            <input
              id="user-id"
              autoFocus
              value={userIdDraft}
              onChange={(event) => setUserIdDraft(event.target.value)}
              placeholder="Enter your user ID"
            />
            <button className="load-button" type="submit">
              Load latest conversations
            </button>
          </form>
        </div>
      )}
      {conversationsOpen && (
        <aside className="conversation-panel">
          <div className="panel-heading">
            <strong>Latest conversations</strong>
            <button
              type="button"
              onClick={() => setConversationsOpen(false)}
              aria-label="Close conversations"
            >
              ×
            </button>
          </div>
          {conversations.length === 0 ? (
            <p className="empty-history">
              No conversations found for this user.
            </p>
          ) : (
            conversations.map((conversation) => (
              <button
                className="conversation-item"
                type="button"
                key={conversation.threadId}
                onClick={() => {
                  setMessages(conversation.messages);
                  setThreadId(conversation.threadId);
                  setConversationsOpen(false);
                }}
              >
                <span>{conversation.title}</span>
                <small>
                  {new Date(conversation.updatedAt).toLocaleDateString()}
                </small>
              </button>
            ))
          )}
        </aside>
      )}
      <section className="chat-stage" aria-label="Chat with MedAtlas">
        {hasStarted && (
          <div className="message-list">
            {messages.map((message) => (
              <article className={`message ${message.role}`} key={message.id}>
                {message.role === "assistant" && (
                  <span className="assistant-mark" aria-hidden="true">
                    +
                  </span>
                )}
                <div className="message-body">
                  <div className="message-content">
                    {message.role === "assistant" ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={markdownComponents}
                      >
                        {message.content}
                      </ReactMarkdown>
                    ) : (
                      message.content
                    )}
                  </div>
                  {message.role === "assistant" && message.content && (
                    <>
                    {message.citations && message.citations.length > 0 && (
                      <div className="citation-list" aria-label="Retrieved sources">
                        {message.citations.map((citation, index) => (
                          <button
                            className="citation-blob"
                            key={citation.id}
                            type="button"
                            onClick={() => setSelectedCitation({ citations: message.citations ?? [], index })}
                            title="Open retrieved source"
                          >
                            <span className="citation-number">{index + 1}</span>
                            <span>{citation.topic}</span>
                            <small>{citation.score.toFixed(3)}</small>
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="message-actions">
                      <button
                        type="button"
                        className={
                          feedback[message.id] === "like" ? "selected-like" : ""
                        }
                        onClick={() => toggleFeedback(message.id, "like")}
                        aria-label="Like response"
                        title="Good response"
                      >
                        <ThumbsUp
                          size={15}
                          fill={
                            feedback[message.id] === "like"
                              ? "currentColor"
                              : "none"
                          }
                        />
                      </button>
                      <button
                        type="button"
                        className={
                          feedback[message.id] === "dislike"
                            ? "selected-dislike"
                            : ""
                        }
                        onClick={() => toggleFeedback(message.id, "dislike")}
                        aria-label="Dislike response"
                        title="Bad response"
                      >
                        <ThumbsDown
                          size={15}
                          fill={
                            feedback[message.id] === "dislike"
                              ? "currentColor"
                              : "none"
                          }
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyResponse(message)}
                        aria-label="Copy response"
                        title="Copy response"
                      >
                        {copiedId === message.id ? (
                          <Check size={15} />
                        ) : (
                          <Copy size={15} />
                        )}
                      </button>
                    </div>
                    </>
                  )}
                </div>
              </article>
            ))}
            {loading && (
              <article
                className="message assistant"
                aria-label="Assistant is thinking"
              >
                <span className="assistant-mark" aria-hidden="true">
                  +
                </span>
                <div className="thinking">
                  <i />
                  <i />
                  <i />
                </div>
              </article>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        <div className={`composer-wrap ${hasStarted ? "started" : "empty"}`}>
          {!hasStarted && (
            <>
              <div className="ambient-glow" aria-hidden="true" />
              <h1>What can I help with?</h1>
            </>
          )}
          <form className="composer" onSubmit={sendMessage}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Ask MedAtlas anything..."
              rows={1}
              disabled={loading}
              aria-label="Message"
            />
            <button
              className="send-button"
              type="submit"
              disabled={!input.trim() || loading}
              aria-label="Send message"
            >
              ↑
            </button>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <p className="composer-note">
            MedAtlas can make mistakes. Verify important clinical information.
          </p>
        </div>
        {selectedCitation && (
          <div
            className="citation-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) setSelectedCitation(null);
            }}
          >
            <section className="citation-modal" role="dialog" aria-modal="true" aria-label="Retrieved source">
              <div className="citation-modal-header">
                <div>
                  <p className="citation-modal-kicker">RETRIEVED SOURCE</p>
                  <h2>{selectedCitation.citations[selectedCitation.index].topic}</h2>
                </div>
                <button type="button" className="close-button" onClick={() => setSelectedCitation(null)} aria-label="Close source">
                  ×
                </button>
              </div>
              <div className="citation-modal-meta">
                <span>[{selectedCitation.index + 1}]</span>
                <span>Score {selectedCitation.citations[selectedCitation.index].score.toFixed(3)}</span>
                <span>{selectedCitation.citations[selectedCitation.index].id}</span>
              </div>
              {selectedCitation.citations[selectedCitation.index].subheadings.length > 0 && (
                <p className="citation-path">
                  {selectedCitation.citations[selectedCitation.index].subheadings.join(" > ")}
                </p>
              )}
              <div className="citation-modal-text">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {selectedCitation.citations[selectedCitation.index].text}
                </ReactMarkdown>
              </div>
              <div className="citation-modal-nav">
                <button
                  type="button"
                  onClick={() => setSelectedCitation(current => current && current.index > 0 ? { ...current, index: current.index - 1 } : current)}
                  disabled={selectedCitation.index === 0}
                >
                  &lt; Prev
                </button>
                <span>{selectedCitation.index + 1} / {selectedCitation.citations.length}</span>
                <button
                  type="button"
                  onClick={() => setSelectedCitation(current => current && current.index < current.citations.length - 1 ? { ...current, index: current.index + 1 } : current)}
                  disabled={selectedCitation.index === selectedCitation.citations.length - 1}
                >
                  Next &gt;
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
