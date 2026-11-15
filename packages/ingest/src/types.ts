export type Source = "imessage" | "whatsapp" | "instagram" | "screenshots";

export type MessageKind = "text" | "media" | "link" | "call" | "system" | "unsent";

export type TimestampConfidence = "exact" | "inferred" | "none";

export interface Participant {
  id: string;
  name: string;
  isSelf: boolean;
}

export interface Reaction {
  by: string | null;
  emoji: string;
}

export interface Message {
  i: number;
  ts: string | null;
  tsConfidence: TimestampConfidence;
  senderId: string;
  isSelf: boolean;
  kind: MessageKind;
  text: string;
  replyTo?: number;
  replyQuote?: string;
  reactions?: Reaction[];
  edited?: boolean;
  readAfter?: string;
  sourceRef: string;
}

export interface Conversation {
  source: Source;
  title: string | null;
  isGroup: boolean;
  participants: Participant[];
  messages: Message[];
  warnings: string[];
}

export interface DraftMessage {
  ts: string | null;
  tsConfidence: TimestampConfidence;
  sender: string;
  isSelf: boolean;
  kind: MessageKind;
  text: string;
  replyToDraft?: number;
  replyQuote?: string;
  reactions?: Reaction[];
  edited?: boolean;
  readAfter?: string;
  sourceRef: string;
}
