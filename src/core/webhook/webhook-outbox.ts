import { hmacSha256Hex } from '../security/sha256.ts';

export type WebhookOutboxState = 'pending' | 'queued' | 'delivered' | 'failed';

export interface WebhookOutboxRecord {
  id: string;
  webhookId: string;
  sessionId: string;
  event: string;
  idempotencyKey: string;
  deliveryId: string;
  state: WebhookOutboxState;
  attempts: number;
  signatureHmacSha256: string;
  payloadJson: string;
  createdAt: string;
}

export const DEFAULT_OUTBOX_RETENTION_DAYS = 7;

export function resolveOutboxRetentionDays(rawEnvValue?: string): number {
  const parsed = Number.parseInt(rawEnvValue ?? '', 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_OUTBOX_RETENTION_DAYS;
  }
  return parsed;
}

export class WebhookOutboxStore {
  private readonly records = new Map<string, WebhookOutboxRecord>();
  private seq = 1;

  openDelivery(input: {
    webhookId: string;
    sessionId: string;
    event: string;
    idempotencyKey: string;
    deliveryId: string;
    secret: string;
    payload: Record<string, unknown>;
    createdAt?: string;
  }): { deduplicated: boolean; record: WebhookOutboxRecord } {
    const compositeKey = `${input.webhookId}::${input.idempotencyKey}`;
    const existing = this.records.get(compositeKey);
    if (existing) {
      return { deduplicated: true, record: existing };
    }

    const payloadJson = JSON.stringify(input.payload);
    const signatureHmacSha256 = `sha256=${hmacSha256Hex(input.secret, payloadJson)}`;
    const record: WebhookOutboxRecord = {
      id: `outbox_${this.seq++}`,
      webhookId: input.webhookId,
      sessionId: input.sessionId,
      event: input.event,
      idempotencyKey: input.idempotencyKey,
      deliveryId: input.deliveryId,
      state: 'pending',
      attempts: 1,
      signatureHmacSha256,
      payloadJson,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    this.records.set(compositeKey, record);
    return { deduplicated: false, record };
  }

  markState(webhookId: string, idempotencyKey: string, state: WebhookOutboxState): WebhookOutboxRecord | undefined {
    const compositeKey = `${webhookId}::${idempotencyKey}`;
    const rec = this.records.get(compositeKey);
    if (!rec) return undefined;
    rec.state = state;
    if (state === 'failed' || state === 'delivered') {
      rec.attempts += 1;
    }
    return rec;
  }

  /**
   * Prune settled rows (`delivered` or `failed`) older than `olderThanDays`.
   * Pending and queued rows are never pruned (`src/modules/webhook/webhook-outbox.service.ts`).
   */
  pruneSettled(olderThanDays: number, nowMs = Date.now()): number {
    const days = resolveOutboxRetentionDays(String(olderThanDays));
    const cutoffMs = nowMs - days * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const [key, rec] of this.records.entries()) {
      if (rec.state === 'pending' || rec.state === 'queued') {
        continue;
      }
      const createdMs = new Date(rec.createdAt).getTime();
      if (Number.isFinite(createdMs) && createdMs < cutoffMs) {
        this.records.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  listAll(): WebhookOutboxRecord[] {
    return Array.from(this.records.values());
  }
}
