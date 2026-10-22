import type { ChatKind, SupportedEngineType } from '../identity/wa-id.ts';

export const EngineStatus = {
  DISCONNECTED: 'disconnected',
  INITIALIZING: 'initializing',
  QR_READY: 'qr_ready',
  AUTHENTICATING: 'authenticating',
  READY: 'ready',
  ACTION_REQUIRED: 'action_required',
  FAILED: 'failed',
} as const;

export type EngineStatus = (typeof EngineStatus)[keyof typeof EngineStatus];

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'voice'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'poll'
  | 'call'
  | 'revoked'
  | 'order'
  | 'product'
  | 'masked'
  | 'unknown';

export interface Quotable {
  quotedMessageId?: string;
}

export interface MediaInput extends Quotable {
  mimetype: string;
  data: string;
  filename?: string;
  caption?: string;
  mentions?: string[];
  ptt?: boolean;
}

export interface MessageResult {
  id: string;
  timestamp: number;
  body?: string;
  engineDialectTarget: string;
  neutralTarget: string;
}

export interface IncomingMessage {
  id: string;
  from: string;
  to: string;
  chatId: string;
  body: string;
  type: MessageType;
  timestamp: number;
  fromMe: boolean;
  isGroup: boolean;
  kind: ChatKind;
  isStatusBroadcast?: boolean;
  ephemeralDuration?: number;
  author?: string;
}

export interface EngineCreateOptions {
  sessionId: string;
  dbSessionId: string;
  proxyUrl?: string;
  proxyType?: 'http' | 'https' | 'socks4' | 'socks5';
}

export interface EngineDescriptor {
  id: SupportedEngineType;
  name: string;
  enabled: boolean;
  transport: string;
  features: string[];
  library: {
    name: string;
    version: string;
  };
}

export interface IWhatsAppEngine {
  readonly engineId: SupportedEngineType;
  readonly sessionId: string;
  readonly wwjsProfileDir: string;
  readonly baileysProfileDir: string;
  getStatus(): EngineStatus;
  setStatus(status: EngineStatus): void;
  requestPairingCode(phoneNumber: string): string;
  sendTextMessage(to: string, text: string, options?: Quotable): MessageResult;
  sendMediaMessage(to: string, media: MediaInput): MessageResult;
}
