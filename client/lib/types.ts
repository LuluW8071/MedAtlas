export type Citation = {
  id: string;
  score: number;
  text: string;
  topic: string;
  subheadings: string[];
  parts: number;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
};

export type Conversation = {
  threadId: string;
  title: string;
  updatedAt: number;
  messages: Message[];
};

export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
