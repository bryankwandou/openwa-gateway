import { hmacSha256Hex, sha256Hex } from './sha256.ts';
import { normalizeWaId } from '../identity/wa-id.ts';

export type ApiKeyRole = 'ADMIN' | 'OPERATOR' | 'READONLY';

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  peppered: boolean;
  role: ApiKeyRole;
  allowedIps: string[] | null;
  allowedSessions: string[] | null;
  allowedChats: string[] | null;
  expiresAt: string | null;
  lastUsedAt?: string | null;
  usageCount: number;
}

/**
 * Reconstructed from `rmyndharis/OpenWA/src/modules/auth/api-key-hash.ts` (`09c254ba5a23ed1c6fe8d9b75036782dc1c43d64`).
 */
export function hashApiKey(rawKey: string, pepper?: string): string {
  return pepper && pepper.length > 0 ? hmacSha256Hex(pepper, rawKey) : sha256Hex(rawKey);
}

/**
 * Collapse an `allowedSessions` or `allowedIps` list to either a non-empty list of trimmed values or `null`.
 * Prevents TypeORM simple-array `['']` widening bug (`src/modules/auth/api-key-authorization.ts`).
 */
export function normalizeScopeList(list: string[] | null | undefined): string[] | null {
  if (list == null) return null;
  const cleaned = list.map(entry => entry.trim()).filter(entry => entry.length > 0);
  return cleaned.length > 0 ? cleaned : null;
}

export function normalizeChatAllowList(list: string[] | null | undefined): string[] | null {
  const cleaned = normalizeScopeList(list);
  if (!cleaned) return null;
  return cleaned.map(item => {
    try {
      return normalizeWaId(item).neutralId;
    } catch {
      return item;
    }
  });
}

export function apiKeyExpiryTime(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export type ApiKeyAuthorization = Pick<
  ApiKeyRecord,
  'role' | 'allowedIps' | 'allowedSessions' | 'allowedChats' | 'expiresAt'
>;

/**
 * Compute a usage-invariant authorization fingerprint so periodic `lastUsedAt` and `usageCount`
 * updates do not disconnect live Socket.IO clients (`apiKeyAuthorizationFingerprint` in OpenWA).
 */
export function apiKeyAuthorizationFingerprint(key: ApiKeyAuthorization): string {
  const scope = (list: string[] | null | undefined): string[] | null => {
    const normalized = normalizeScopeList(list);
    return normalized ? [...normalized].sort() : null;
  };
  return JSON.stringify([
    key.role,
    scope(key.allowedIps),
    scope(key.allowedSessions),
    scope(normalizeChatAllowList(key.allowedChats)),
    apiKeyExpiryTime(key.expiresAt),
  ]);
}
