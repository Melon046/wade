export type MessageRole = "user" | "assistant" | "system";

export interface Conversation {
  id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  model: string | null;
  provider: string | null;
  created_at: string;
}

/** A message being rendered locally, before the server has confirmed it. */
export interface PendingMessage {
  id: string;
  role: MessageRole;
  content: string;
  pending?: boolean;
  error?: boolean;
}
