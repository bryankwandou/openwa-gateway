export type ChatKind = 'direct' | 'group' | 'lid' | 'newsletter' | 'broadcast' | 'status' | 'unknown';

export type SupportedEngineType = 'whatsapp-web.js' | 'baileys';

export interface ParsedWaId {
  raw: string;
  userPart: string;
  devicePart: string | null;
  domainPart: string;
  neutralId: string;
  kind: ChatKind;
  resolvedViaLidStore: boolean;
}

/**
 * Strip device suffix (`:14`) from the user portion of a WhatsApp JID/WID.
 */
export function stripDeviceSuffix(userWithDevice: string): { user: string; device: string | null } {
  const colonIdx = userWithDevice.indexOf(':');
  if (colonIdx === -1) {
    return { user: userWithDevice, device: null };
  }
  return {
    user: userWithDevice.slice(0, colonIdx),
    device: userWithDevice.slice(colonIdx + 1) || null,
  };
}

/**
 * Classify a normalized neutral WhatsApp identifier into a first-class ChatKind.
 */
export function classifyChatKind(neutralId: string): ChatKind {
  if (neutralId === 'status@broadcast') return 'status';
  if (neutralId.endsWith('@c.us')) return 'direct';
  if (neutralId.endsWith('@g.us')) return 'group';
  if (neutralId.endsWith('@lid')) return 'lid';
  if (neutralId.endsWith('@newsletter')) return 'newsletter';
  if (neutralId.endsWith('@broadcast')) return 'broadcast';
  return 'unknown';
}

/**
 * Normalize any engine-specific JID/WID into the OpenWA neutral anti-corruption dialect:
 * - `<phone>@s.whatsapp.net` or `<phone>:<device>@s.whatsapp.net` -> `<phone>@c.us`
 * - `<phone>:<device>@c.us` -> `<phone>@c.us`
 * - `<lid>:<device>@lid` -> `<phone>@c.us` (if lidToPhoneResolver resolves it) or `<lid>@lid`
 * - `<id>@g.us`, `status@broadcast`, `<id>@newsletter`, `<id>@broadcast` preserved
 */
export function normalizeWaId(
  rawId: string,
  lidToPhoneResolver?: (lid: string) => string | undefined,
): ParsedWaId {
  const trimmed = rawId.trim();
  if (!trimmed) {
    throw new Error('WhatsApp identifier must not be empty');
  }

  // Raw phone digits without domain
  if (/^\+?\d{7,15}$/.test(trimmed)) {
    const digits = trimmed.replace(/^\+/, '');
    const neutralId = `${digits}@c.us`;
    return {
      raw: rawId,
      userPart: digits,
      devicePart: null,
      domainPart: 'c.us',
      neutralId,
      kind: 'direct',
      resolvedViaLidStore: false,
    };
  }

  const atIdx = trimmed.lastIndexOf('@');
  if (atIdx <= 0 || atIdx === trimmed.length - 1) {
    throw new Error(`Invalid WhatsApp JID format: ${rawId}`);
  }

  const rawUser = trimmed.slice(0, atIdx);
  const rawDomain = trimmed.slice(atIdx + 1).toLowerCase();
  const { user, device } = stripDeviceSuffix(rawUser);

  if (!user || /[\\/\0\s]/.test(user)) {
    throw new Error(`Unsafe user component in WhatsApp JID: ${rawId}`);
  }

  if (rawDomain === 's.whatsapp.net' || rawDomain === 'c.us') {
    const cleanPhone = user.replace(/^\+/, '');
    const neutralId = `${cleanPhone}@c.us`;
    return {
      raw: rawId,
      userPart: cleanPhone,
      devicePart: device,
      domainPart: rawDomain,
      neutralId,
      kind: 'direct',
      resolvedViaLidStore: false,
    };
  }

  if (rawDomain === 'lid') {
    const canonicalLid = `${user}@lid`;
    const mappedPhone = lidToPhoneResolver?.(canonicalLid);
    if (mappedPhone) {
      const normalizedPhone = mappedPhone.endsWith('@c.us')
        ? mappedPhone
        : `${mappedPhone.replace(/@.*$/, '').replace(/^\+/, '')}@c.us`;
      return {
        raw: rawId,
        userPart: user,
        devicePart: device,
        domainPart: 'lid',
        neutralId: normalizedPhone,
        kind: 'direct',
        resolvedViaLidStore: true,
      };
    }
    return {
      raw: rawId,
      userPart: user,
      devicePart: device,
      domainPart: 'lid',
      neutralId: canonicalLid,
      kind: 'lid',
      resolvedViaLidStore: false,
    };
  }

  if (rawDomain === 'g.us') {
    const neutralId = `${user}@g.us`;
    return {
      raw: rawId,
      userPart: user,
      devicePart: device,
      domainPart: 'g.us',
      neutralId,
      kind: 'group',
      resolvedViaLidStore: false,
    };
  }

  if (rawDomain === 'broadcast') {
    const neutralId = `${user}@broadcast`;
    return {
      raw: rawId,
      userPart: user,
      devicePart: device,
      domainPart: 'broadcast',
      neutralId,
      kind: user === 'status' ? 'status' : 'broadcast',
      resolvedViaLidStore: false,
    };
  }

  if (rawDomain === 'newsletter') {
    const neutralId = `${user}@newsletter`;
    return {
      raw: rawId,
      userPart: user,
      devicePart: device,
      domainPart: 'newsletter',
      neutralId,
      kind: 'newsletter',
      resolvedViaLidStore: false,
    };
  }

  return {
    raw: rawId,
    userPart: user,
    devicePart: device,
    domainPart: rawDomain,
    neutralId: `${user}@${rawDomain}`,
    kind: 'unknown',
    resolvedViaLidStore: false,
  };
}

/**
 * De-normalize a neutral WID into the target engine's native wire dialect.
 * - `baileys` uses `<phone>@s.whatsapp.net` for direct user JIDs.
 * - `whatsapp-web.js` uses `<phone>@c.us` for direct user WIDs.
 */
export function toEngineDialect(
  inputId: string,
  engineType: SupportedEngineType,
  lidToPhoneResolver?: (lid: string) => string | undefined,
): string {
  const parsed = normalizeWaId(inputId, lidToPhoneResolver);
  if (parsed.kind === 'direct') {
    const phoneDigits = parsed.neutralId.slice(0, -'@c.us'.length);
    return engineType === 'baileys' ? `${phoneDigits}@s.whatsapp.net` : `${phoneDigits}@c.us`;
  }
  return parsed.neutralId;
}
