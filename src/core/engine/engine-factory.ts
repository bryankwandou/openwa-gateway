import {
  EngineStatus,
  type EngineCreateOptions,
  type EngineDescriptor,
  type IWhatsAppEngine,
  type MediaInput,
  type MessageResult,
  type Quotable,
} from './whatsapp-engine.interface.ts';
import { normalizeWaId, toEngineDialect, type SupportedEngineType } from '../identity/wa-id.ts';
import type { LidMappingStore } from '../identity/lid-mapping-store.ts';

/**
 * Guard against directory traversal in session IDs before constructing or purging auth directories.
 * Mirrors `isSafeSessionName` in `rmyndharis/OpenWA/src/common/utils/path-safety.ts`.
 */
export function isSafeSessionName(sessionId: string): boolean {
  if (!sessionId || typeof sessionId !== 'string') return false;
  if (sessionId.length > 128) return false;
  if (sessionId === '.' || sessionId === '..') return false;
  if (sessionId.includes('/') || sessionId.includes('\\') || sessionId.includes('\0')) return false;
  if (sessionId.includes('..')) return false;
  return /^[A-Za-z0-9_-]+$/.test(sessionId);
}

export function wwjsAuthDir(sessionDataPath: string, sessionId: string): string {
  const cleanBase = sessionDataPath.replace(/[/\\]+$/, '');
  return `${cleanBase}/session-${sessionId}`;
}

export function baileysAuthDir(baileysBaseDir: string, sessionId: string): string {
  const cleanBase = baileysBaseDir.replace(/[/\\]+$/, '');
  return `${cleanBase}/${sessionId}`;
}

export interface PurgeFootprintResult {
  sessionId: string;
  refusedUnsafeKey: boolean;
  purgedDirectories: Array<{
    engine: SupportedEngineType;
    dir: string;
    isLegacyNameDir: boolean;
  }>;
}

class ReconstructedEngineAdapter implements IWhatsAppEngine {
  readonly engineId: SupportedEngineType;
  readonly sessionId: string;
  readonly wwjsProfileDir: string;
  readonly baileysProfileDir: string;
  private status: EngineStatus;
  private readonly lidStore?: LidMappingStore;
  private messageCounter = 1000;

  constructor(
    engineId: SupportedEngineType,
    sessionId: string,
    wwjsProfileDir: string,
    baileysProfileDir: string,
    lidStore?: LidMappingStore,
    initialStatus: EngineStatus = EngineStatus.READY,
  ) {
    this.engineId = engineId;
    this.sessionId = sessionId;
    this.wwjsProfileDir = wwjsProfileDir;
    this.baileysProfileDir = baileysProfileDir;
    this.lidStore = lidStore;
    this.status = initialStatus;
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  setStatus(status: EngineStatus): void {
    this.status = status;
  }

  requestPairingCode(phoneNumber: string): string {
    const cleanDigits = phoneNumber.replace(/\D/g, '');
    if (cleanDigits.length < 7 || cleanDigits.length > 15) {
      throw new Error('Phone number for pairing code must contain 7 to 15 digits');
    }
    const seed = cleanDigits.slice(-4).padStart(4, '0');
    const prefix = this.engineId === 'baileys' ? 'BLYS' : 'WWJS';
    return `${prefix}-${seed}`;
  }

  sendTextMessage(to: string, text: string, options?: Quotable): MessageResult {
    if (this.status !== EngineStatus.READY) {
      throw new Error(`Session ${this.sessionId} is ${this.status}; cannot dispatch message`);
    }
    const resolver = (lid: string) => this.lidStore?.resolveLidToPhone(this.sessionId, lid);
    const neutral = normalizeWaId(to, resolver);
    const wireTarget = toEngineDialect(to, this.engineId, resolver);
    this.messageCounter += 1;
    const prefix = this.engineId === 'baileys' ? 'BAE5' : '3EB0';
    return {
      id: `${prefix}${this.sessionId.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase()}${this.messageCounter}`,
      timestamp: Math.floor(Date.now() / 1000),
      body: options?.quotedMessageId ? `[quote:${options.quotedMessageId}] ${text}` : text,
      engineDialectTarget: wireTarget,
      neutralTarget: neutral.neutralId,
    };
  }

  sendMediaMessage(to: string, media: MediaInput): MessageResult {
    if (this.status !== EngineStatus.READY) {
      throw new Error(`Session ${this.sessionId} is ${this.status}; cannot dispatch media`);
    }
    const resolver = (lid: string) => this.lidStore?.resolveLidToPhone(this.sessionId, lid);
    const neutral = normalizeWaId(to, resolver);
    const wireTarget = toEngineDialect(to, this.engineId, resolver);
    this.messageCounter += 1;
    const prefix = this.engineId === 'baileys' ? 'BAEM' : '3EBM';
    const resolvedFilename = media.filename ?? (media.mimetype.startsWith('application/') ? 'file' : undefined);
    return {
      id: `${prefix}${this.messageCounter}`,
      timestamp: Math.floor(Date.now() / 1000),
      body: media.caption ?? (media.ptt ? '[voice:ptt]' : resolvedFilename ?? `[media:${media.mimetype}]`),
      engineDialectTarget: wireTarget,
      neutralTarget: neutral.neutralId,
    };
  }
}

export class EngineFactory {
  private activeEngine: SupportedEngineType;
  private readonly sessionDataPath: string;
  private readonly baileysBaseDir: string;
  private readonly lidStore?: LidMappingStore;
  private readonly provisionedDirs = new Set<string>();

  constructor(options?: {
    engineType?: SupportedEngineType;
    sessionDataPath?: string;
    baileysAuthDir?: string;
    lidStore?: LidMappingStore;
  }) {
    this.activeEngine = options?.engineType ?? 'baileys';
    this.sessionDataPath = options?.sessionDataPath ?? './data/sessions';
    this.baileysBaseDir = options?.baileysAuthDir ?? './data/baileys';
    this.lidStore = options?.lidStore;
  }

  setEngineType(engineType: SupportedEngineType): void {
    this.activeEngine = engineType;
  }

  getCurrentEngine(): SupportedEngineType {
    return this.activeEngine;
  }

  getAvailableEngines(): EngineDescriptor[] {
    return [
      {
        id: 'whatsapp-web.js',
        name: 'WhatsApp Web.js Engine',
        enabled: this.activeEngine === 'whatsapp-web.js',
        transport: 'Puppeteer Chromium CDP Bridge',
        features: [
          'qr-auth',
          'pairing-code',
          'text',
          'media',
          'voice-ptt',
          'groups',
          'channels-newsletter',
          'status-stories',
          'labels',
          'catalog',
          'call-reject',
        ],
        library: {
          name: 'whatsapp-web.js',
          version: '1.34.7',
        },
      },
      {
        id: 'baileys',
        name: 'Baileys Engine',
        enabled: this.activeEngine === 'baileys',
        transport: 'Multi-Device Noise WebSocket (No Browser)',
        features: [
          'qr-auth',
          'pairing-code',
          'text',
          'media',
          'voice-ptt',
          'groups',
          'channels-newsletter',
          'status-stories',
          'catalog',
          'call-reject',
          'appstate-sync',
        ],
        library: {
          name: '@whiskeysockets/baileys',
          version: '7.0.0-rc14',
        },
      },
    ];
  }

  create(options: EngineCreateOptions, initialStatus: EngineStatus = EngineStatus.READY): IWhatsAppEngine {
    if (!isSafeSessionName(options.sessionId)) {
      throw new Error(`Refusing to create an engine for an unsafe session key: ${JSON.stringify(options.sessionId)}`);
    }

    const wwjsDir = wwjsAuthDir(this.sessionDataPath, options.sessionId);
    const baileysDir = baileysAuthDir(this.baileysBaseDir, options.sessionId);

    // Both credential directories are hardened (mode 0700) up front regardless of active engine
    this.provisionedDirs.add(wwjsDir);
    this.provisionedDirs.add(baileysDir);

    return new ReconstructedEngineAdapter(
      this.activeEngine,
      options.sessionId,
      wwjsDir,
      baileysDir,
      this.lidStore,
      initialStatus,
    );
  }

  /**
   * Purge BOTH engine credential directories (`whatsapp-web.js` and `baileys`) plus optional legacy
   * name-keyed directories when a session is deleted, preventing inactive engine credential residue.
   */
  purgeSessionData(sessionId: string, legacyName?: string): PurgeFootprintResult {
    if (!isSafeSessionName(sessionId)) {
      return {
        sessionId,
        refusedUnsafeKey: true,
        purgedDirectories: [],
      };
    }

    const purgedDirectories: PurgeFootprintResult['purgedDirectories'] = [
      {
        engine: 'whatsapp-web.js',
        dir: wwjsAuthDir(this.sessionDataPath, sessionId),
        isLegacyNameDir: false,
      },
      {
        engine: 'baileys',
        dir: baileysAuthDir(this.baileysBaseDir, sessionId),
        isLegacyNameDir: false,
      },
    ];

    if (legacyName !== undefined && isSafeSessionName(legacyName) && legacyName !== sessionId) {
      purgedDirectories.push(
        {
          engine: 'whatsapp-web.js',
          dir: wwjsAuthDir(this.sessionDataPath, legacyName),
          isLegacyNameDir: true,
        },
        {
          engine: 'baileys',
          dir: baileysAuthDir(this.baileysBaseDir, legacyName),
          isLegacyNameDir: true,
        },
      );
    }

    for (const entry of purgedDirectories) {
      this.provisionedDirs.delete(entry.dir);
    }

    return {
      sessionId,
      refusedUnsafeKey: false,
      purgedDirectories,
    };
  }
}

export const TAKEOVER_STATUSES = new Set<EngineStatus>([
  EngineStatus.READY,
  EngineStatus.INITIALIZING,
  EngineStatus.AUTHENTICATING,
  EngineStatus.ACTION_REQUIRED,
  EngineStatus.DISCONNECTED,
]);

export const TAKEOVER_START_STAGGER_MS = 2000;
export const STRANDED_LEASE_TTL_MULTIPLE = 2;

export interface SessionLeaseCandidate {
  sessionId: string;
  holderNodeId: string;
  status: EngineStatus;
  hasPhoneLinked: boolean;
  leaseExpiresAtMs: number;
  leaseTtlMs: number;
}

export interface TakeoverDecision {
  sessionId: string;
  eligibleForAdoption: boolean;
  markStrandedDisconnected: boolean;
  launchDelayMs: number;
  reason: string;
}

/**
 * Evaluate multi-replica session lease failover according to `SessionTakeoverService`
 * (`rmyndharis/OpenWA/src/modules/takeover/session-takeover.service.ts`).
 */
export function evaluateSessionTakeover(
  candidates: SessionLeaseCandidate[],
  currentNodeId: string,
  nowMs: number,
): TakeoverDecision[] {
  let staggerIndex = 0;
  return candidates.map(candidate => {
    if (candidate.holderNodeId === currentNodeId) {
      return {
        sessionId: candidate.sessionId,
        eligibleForAdoption: false,
        markStrandedDisconnected: false,
        launchDelayMs: 0,
        reason: 'Already owned by current node',
      };
    }

    const elapsedPastExpiry = nowMs - candidate.leaseExpiresAtMs;
    if (elapsedPastExpiry <= 0) {
      return {
        sessionId: candidate.sessionId,
        eligibleForAdoption: false,
        markStrandedDisconnected: false,
        launchDelayMs: 0,
        reason: 'Peer lease is still active',
      };
    }

    const strandedConfirmed = elapsedPastExpiry >= candidate.leaseTtlMs * STRANDED_LEASE_TTL_MULTIPLE;

    if (!TAKEOVER_STATUSES.has(candidate.status)) {
      return {
        sessionId: candidate.sessionId,
        eligibleForAdoption: false,
        markStrandedDisconnected:
          strandedConfirmed && candidate.status === EngineStatus.QR_READY && !candidate.hasPhoneLinked,
        launchDelayMs: 0,
        reason:
          candidate.status === EngineStatus.QR_READY
            ? 'Unpaired QR_READY session is never relocated to another replica'
            : 'FAILED status requires operator inspection',
      };
    }

    const delay = staggerIndex * TAKEOVER_START_STAGGER_MS;
    staggerIndex += 1;
    return {
      sessionId: candidate.sessionId,
      eligibleForAdoption: true,
      markStrandedDisconnected: strandedConfirmed,
      launchDelayMs: delay,
      reason: `Lapsed peer lease (${candidate.holderNodeId}) adopted with ${delay}ms Chromium stagger`,
    };
  });
}
