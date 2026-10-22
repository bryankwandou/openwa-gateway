import { normalizeWaId, stripDeviceSuffix } from './wa-id.ts';

export type LidMappingSource = 'group-metadata-harvest' | 'inbound-envelope' | 'contact-sync' | 'manual-operator';

export interface LidMappingRecord {
  sessionId: string;
  lid: string;
  phoneWid: string;
  source: LidMappingSource;
  updatedAt: string;
}

export interface GroupParticipantHarvestInput {
  id?: string;
  lid?: string;
  phoneNumber?: string;
  jid?: string;
}

/**
 * Bidirectional `@lid <-> <phone>@c.us` mapping store reconstructed from
 * `rmyndharis/OpenWA/src/engine/identity/lid-mapping-store.service.ts`.
 */
export class LidMappingStore {
  private readonly lidToRecord = new Map<string, LidMappingRecord>();
  private readonly phoneToLid = new Map<string, string>();

  constructor(initialRecords: LidMappingRecord[] = []) {
    for (const record of initialRecords) {
      this.lidToRecord.set(`${record.sessionId}::${record.lid}`, record);
      this.phoneToLid.set(`${record.sessionId}::${record.phoneWid}`, record.lid);
    }
  }

  private normalizeLidKey(rawLid: string): string {
    const trimmed = rawLid.trim();
    const atIdx = trimmed.lastIndexOf('@');
    const userRaw = atIdx === -1 ? trimmed : trimmed.slice(0, atIdx);
    const { user } = stripDeviceSuffix(userRaw);
    if (!user || !/^\d{5,25}$/.test(user)) {
      throw new Error(`Invalid WhatsApp LID identifier: ${rawLid}`);
    }
    return `${user}@lid`;
  }

  private normalizePhoneKey(rawPhone: string): string {
    const parsed = normalizeWaId(rawPhone);
    if (parsed.kind !== 'direct') {
      throw new Error(`Expected direct phone WID (<phone>@c.us), received: ${rawPhone}`);
    }
    return parsed.neutralId;
  }

  upsertMapping(
    sessionId: string,
    rawLid: string,
    rawPhone: string,
    source: LidMappingSource = 'inbound-envelope',
  ): LidMappingRecord {
    const lid = this.normalizeLidKey(rawLid);
    const phoneWid = this.normalizePhoneKey(rawPhone);
    const record: LidMappingRecord = {
      sessionId,
      lid,
      phoneWid,
      source,
      updatedAt: new Date().toISOString(),
    };
    this.lidToRecord.set(`${sessionId}::${lid}`, record);
    this.phoneToLid.set(`${sessionId}::${phoneWid}`, lid);
    return record;
  }

  resolveLidToPhone(sessionId: string, rawLid: string): string | undefined {
    try {
      const lid = this.normalizeLidKey(rawLid);
      return this.lidToRecord.get(`${sessionId}::${lid}`)?.phoneWid;
    } catch {
      return undefined;
    }
  }

  resolvePhoneToLid(sessionId: string, rawPhone: string): string | undefined {
    try {
      const phoneWid = this.normalizePhoneKey(rawPhone);
      return this.phoneToLid.get(`${sessionId}::${phoneWid}`);
    } catch {
      return undefined;
    }
  }

  resolveToNeutral(sessionId: string, rawIdentifier: string) {
    return normalizeWaId(rawIdentifier, lid => this.resolveLidToPhone(sessionId, lid));
  }

  harvestGroupParticipants(
    sessionId: string,
    participants: GroupParticipantHarvestInput[],
  ): LidMappingRecord[] {
    const harvested: LidMappingRecord[] = [];
    for (const participant of participants) {
      const candidateLid =
        participant.lid ??
        (participant.id?.includes('@lid') ? participant.id : undefined);
      const candidatePhone =
        participant.phoneNumber ??
        participant.jid ??
        (participant.id && !participant.id.includes('@lid') ? participant.id : undefined);

      if (candidateLid && candidatePhone) {
        try {
          const rec = this.upsertMapping(
            sessionId,
            candidateLid,
            candidatePhone,
            'group-metadata-harvest',
          );
          harvested.push(rec);
        } catch {
          // Ignore malformed participant rows during group metadata harvest
        }
      }
    }
    return harvested;
  }

  listBySession(sessionId?: string): LidMappingRecord[] {
    const all = Array.from(this.lidToRecord.values());
    if (!sessionId) return all;
    return all.filter(item => item.sessionId === sessionId);
  }
}

export const INITIAL_LID_MAPPINGS: LidMappingRecord[] = [
  {
    sessionId: 'sess-baileys-primary-01',
    lid: '198472910384712@lid',
    phoneWid: '6281190283741@c.us',
    source: 'group-metadata-harvest',
    updatedAt: '2026-10-21T12:10:00.000Z',
  },
  {
    sessionId: 'sess-baileys-primary-01',
    lid: '248192039481726@lid',
    phoneWid: '6281288391024@c.us',
    source: 'inbound-envelope',
    updatedAt: '2026-10-21T12:24:15.000Z',
  },
  {
    sessionId: 'sess-wwebjs-fallback-02',
    lid: '839102938471625@lid',
    phoneWid: '6285719283746@c.us',
    source: 'contact-sync',
    updatedAt: '2026-10-21T12:35:00.000Z',
  },
];
