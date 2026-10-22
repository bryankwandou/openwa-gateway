// openwa-gateway/src/core/engine/whatsapp-engine.interface.ts
var EngineStatus = {
  DISCONNECTED: "disconnected",
  INITIALIZING: "initializing",
  QR_READY: "qr_ready",
  AUTHENTICATING: "authenticating",
  READY: "ready",
  ACTION_REQUIRED: "action_required",
  FAILED: "failed"
};

// openwa-gateway/src/core/identity/wa-id.ts
function stripDeviceSuffix(userWithDevice) {
  const colonIdx = userWithDevice.indexOf(":");
  if (colonIdx === -1) {
    return { user: userWithDevice, device: null };
  }
  return {
    user: userWithDevice.slice(0, colonIdx),
    device: userWithDevice.slice(colonIdx + 1) || null
  };
}
function normalizeWaId(rawId, lidToPhoneResolver) {
  const trimmed = rawId.trim();
  if (!trimmed) {
    throw new Error("WhatsApp identifier must not be empty");
  }
  if (/^\+?\d{7,15}$/.test(trimmed)) {
    const digits = trimmed.replace(/^\+/, "");
    const neutralId = `${digits}@c.us`;
    return {
      raw: rawId,
      userPart: digits,
      devicePart: null,
      domainPart: "c.us",
      neutralId,
      kind: "direct",
      resolvedViaLidStore: false
    };
  }
  const atIdx = trimmed.lastIndexOf("@");
  if (atIdx <= 0 || atIdx === trimmed.length - 1) {
    throw new Error(`Invalid WhatsApp JID format: ${rawId}`);
  }
  const rawUser = trimmed.slice(0, atIdx);
  const rawDomain = trimmed.slice(atIdx + 1).toLowerCase();
  const { user, device } = stripDeviceSuffix(rawUser);
  if (!user || /[\\/\0\s]/.test(user)) {
    throw new Error(`Unsafe user component in WhatsApp JID: ${rawId}`);
  }
  if (rawDomain === "s.whatsapp.net" || rawDomain === "c.us") {
    const cleanPhone = user.replace(/^\+/, "");
    const neutralId = `${cleanPhone}@c.us`;
    return {
      raw: rawId,
      userPart: cleanPhone,
      devicePart: device,
      domainPart: rawDomain,
      neutralId,
      kind: "direct",
      resolvedViaLidStore: false
    };
  }
  if (rawDomain === "lid") {
    const canonicalLid = `${user}@lid`;
    const mappedPhone = lidToPhoneResolver?.(canonicalLid);
    if (mappedPhone) {
      const normalizedPhone = mappedPhone.endsWith("@c.us") ? mappedPhone : `${mappedPhone.replace(/@.*$/, "").replace(/^\+/, "")}@c.us`;
      return {
        raw: rawId,
        userPart: user,
        devicePart: device,
        domainPart: "lid",
        neutralId: normalizedPhone,
        kind: "direct",
        resolvedViaLidStore: true
      };
    }
    return {
      raw: rawId,
      userPart: user,
      devicePart: device,
      domainPart: "lid",
      neutralId: canonicalLid,
      kind: "lid",
      resolvedViaLidStore: false
    };
  }
  if (rawDomain === "g.us") {
    const neutralId = `${user}@g.us`;
    return {
      raw: rawId,
      userPart: user,
      devicePart: device,
      domainPart: "g.us",
      neutralId,
      kind: "group",
      resolvedViaLidStore: false
    };
  }
  if (rawDomain === "broadcast") {
    const neutralId = `${user}@broadcast`;
    return {
      raw: rawId,
      userPart: user,
      devicePart: device,
      domainPart: "broadcast",
      neutralId,
      kind: user === "status" ? "status" : "broadcast",
      resolvedViaLidStore: false
    };
  }
  if (rawDomain === "newsletter") {
    const neutralId = `${user}@newsletter`;
    return {
      raw: rawId,
      userPart: user,
      devicePart: device,
      domainPart: "newsletter",
      neutralId,
      kind: "newsletter",
      resolvedViaLidStore: false
    };
  }
  return {
    raw: rawId,
    userPart: user,
    devicePart: device,
    domainPart: rawDomain,
    neutralId: `${user}@${rawDomain}`,
    kind: "unknown",
    resolvedViaLidStore: false
  };
}
function toEngineDialect(inputId, engineType, lidToPhoneResolver) {
  const parsed = normalizeWaId(inputId, lidToPhoneResolver);
  if (parsed.kind === "direct") {
    const phoneDigits = parsed.neutralId.slice(0, -"@c.us".length);
    return engineType === "baileys" ? `${phoneDigits}@s.whatsapp.net` : `${phoneDigits}@c.us`;
  }
  return parsed.neutralId;
}

// openwa-gateway/src/core/engine/engine-factory.ts
function isSafeSessionName(sessionId) {
  if (!sessionId || typeof sessionId !== "string") return false;
  if (sessionId.length > 128) return false;
  if (sessionId === "." || sessionId === "..") return false;
  if (sessionId.includes("/") || sessionId.includes("\\") || sessionId.includes("\0")) return false;
  if (sessionId.includes("..")) return false;
  return /^[A-Za-z0-9_-]+$/.test(sessionId);
}
function wwjsAuthDir(sessionDataPath, sessionId) {
  const cleanBase = sessionDataPath.replace(/[/\\]+$/, "");
  return `${cleanBase}/session-${sessionId}`;
}
function baileysAuthDir(baileysBaseDir, sessionId) {
  const cleanBase = baileysBaseDir.replace(/[/\\]+$/, "");
  return `${cleanBase}/${sessionId}`;
}
var ReconstructedEngineAdapter = class {
  engineId;
  sessionId;
  wwjsProfileDir;
  baileysProfileDir;
  status;
  lidStore;
  messageCounter = 1e3;
  constructor(engineId, sessionId, wwjsProfileDir, baileysProfileDir, lidStore2, initialStatus = EngineStatus.READY) {
    this.engineId = engineId;
    this.sessionId = sessionId;
    this.wwjsProfileDir = wwjsProfileDir;
    this.baileysProfileDir = baileysProfileDir;
    this.lidStore = lidStore2;
    this.status = initialStatus;
  }
  getStatus() {
    return this.status;
  }
  setStatus(status) {
    this.status = status;
  }
  requestPairingCode(phoneNumber) {
    const cleanDigits = phoneNumber.replace(/\D/g, "");
    if (cleanDigits.length < 7 || cleanDigits.length > 15) {
      throw new Error("Phone number for pairing code must contain 7 to 15 digits");
    }
    const seed = cleanDigits.slice(-4).padStart(4, "0");
    const prefix = this.engineId === "baileys" ? "BLYS" : "WWJS";
    return `${prefix}-${seed}`;
  }
  sendTextMessage(to, text, options) {
    if (this.status !== EngineStatus.READY) {
      throw new Error(`Session ${this.sessionId} is ${this.status}; cannot dispatch message`);
    }
    const resolver = (lid) => this.lidStore?.resolveLidToPhone(this.sessionId, lid);
    const neutral = normalizeWaId(to, resolver);
    const wireTarget = toEngineDialect(to, this.engineId, resolver);
    this.messageCounter += 1;
    const prefix = this.engineId === "baileys" ? "BAE5" : "3EB0";
    return {
      id: `${prefix}${this.sessionId.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase()}${this.messageCounter}`,
      timestamp: Math.floor(Date.now() / 1e3),
      body: options?.quotedMessageId ? `[quote:${options.quotedMessageId}] ${text}` : text,
      engineDialectTarget: wireTarget,
      neutralTarget: neutral.neutralId
    };
  }
  sendMediaMessage(to, media) {
    if (this.status !== EngineStatus.READY) {
      throw new Error(`Session ${this.sessionId} is ${this.status}; cannot dispatch media`);
    }
    const resolver = (lid) => this.lidStore?.resolveLidToPhone(this.sessionId, lid);
    const neutral = normalizeWaId(to, resolver);
    const wireTarget = toEngineDialect(to, this.engineId, resolver);
    this.messageCounter += 1;
    const prefix = this.engineId === "baileys" ? "BAEM" : "3EBM";
    const resolvedFilename = media.filename ?? (media.mimetype.startsWith("application/") ? "file" : void 0);
    return {
      id: `${prefix}${this.messageCounter}`,
      timestamp: Math.floor(Date.now() / 1e3),
      body: media.caption ?? (media.ptt ? "[voice:ptt]" : resolvedFilename ?? `[media:${media.mimetype}]`),
      engineDialectTarget: wireTarget,
      neutralTarget: neutral.neutralId
    };
  }
};
var EngineFactory = class {
  activeEngine;
  sessionDataPath;
  baileysBaseDir;
  lidStore;
  provisionedDirs = /* @__PURE__ */ new Set();
  constructor(options) {
    this.activeEngine = options?.engineType ?? "baileys";
    this.sessionDataPath = options?.sessionDataPath ?? "./data/sessions";
    this.baileysBaseDir = options?.baileysAuthDir ?? "./data/baileys";
    this.lidStore = options?.lidStore;
  }
  setEngineType(engineType) {
    this.activeEngine = engineType;
  }
  getCurrentEngine() {
    return this.activeEngine;
  }
  getAvailableEngines() {
    return [
      {
        id: "whatsapp-web.js",
        name: "WhatsApp Web.js Engine",
        enabled: this.activeEngine === "whatsapp-web.js",
        transport: "Puppeteer Chromium CDP Bridge",
        features: [
          "qr-auth",
          "pairing-code",
          "text",
          "media",
          "voice-ptt",
          "groups",
          "channels-newsletter",
          "status-stories",
          "labels",
          "catalog",
          "call-reject"
        ],
        library: {
          name: "whatsapp-web.js",
          version: "1.34.7"
        }
      },
      {
        id: "baileys",
        name: "Baileys Engine",
        enabled: this.activeEngine === "baileys",
        transport: "Multi-Device Noise WebSocket (No Browser)",
        features: [
          "qr-auth",
          "pairing-code",
          "text",
          "media",
          "voice-ptt",
          "groups",
          "channels-newsletter",
          "status-stories",
          "catalog",
          "call-reject",
          "appstate-sync"
        ],
        library: {
          name: "@whiskeysockets/baileys",
          version: "7.0.0-rc14"
        }
      }
    ];
  }
  create(options, initialStatus = EngineStatus.READY) {
    if (!isSafeSessionName(options.sessionId)) {
      throw new Error(`Refusing to create an engine for an unsafe session key: ${JSON.stringify(options.sessionId)}`);
    }
    const wwjsDir = wwjsAuthDir(this.sessionDataPath, options.sessionId);
    const baileysDir = baileysAuthDir(this.baileysBaseDir, options.sessionId);
    this.provisionedDirs.add(wwjsDir);
    this.provisionedDirs.add(baileysDir);
    return new ReconstructedEngineAdapter(
      this.activeEngine,
      options.sessionId,
      wwjsDir,
      baileysDir,
      this.lidStore,
      initialStatus
    );
  }
  /**
   * Purge BOTH engine credential directories (`whatsapp-web.js` and `baileys`) plus optional legacy
   * name-keyed directories when a session is deleted, preventing inactive engine credential residue.
   */
  purgeSessionData(sessionId, legacyName) {
    if (!isSafeSessionName(sessionId)) {
      return {
        sessionId,
        refusedUnsafeKey: true,
        purgedDirectories: []
      };
    }
    const purgedDirectories = [
      {
        engine: "whatsapp-web.js",
        dir: wwjsAuthDir(this.sessionDataPath, sessionId),
        isLegacyNameDir: false
      },
      {
        engine: "baileys",
        dir: baileysAuthDir(this.baileysBaseDir, sessionId),
        isLegacyNameDir: false
      }
    ];
    if (legacyName !== void 0 && isSafeSessionName(legacyName) && legacyName !== sessionId) {
      purgedDirectories.push(
        {
          engine: "whatsapp-web.js",
          dir: wwjsAuthDir(this.sessionDataPath, legacyName),
          isLegacyNameDir: true
        },
        {
          engine: "baileys",
          dir: baileysAuthDir(this.baileysBaseDir, legacyName),
          isLegacyNameDir: true
        }
      );
    }
    for (const entry of purgedDirectories) {
      this.provisionedDirs.delete(entry.dir);
    }
    return {
      sessionId,
      refusedUnsafeKey: false,
      purgedDirectories
    };
  }
};
var TAKEOVER_STATUSES = /* @__PURE__ */ new Set([
  EngineStatus.READY,
  EngineStatus.INITIALIZING,
  EngineStatus.AUTHENTICATING,
  EngineStatus.ACTION_REQUIRED,
  EngineStatus.DISCONNECTED
]);

// openwa-gateway/src/core/identity/lid-mapping-store.ts
var LidMappingStore = class {
  lidToRecord = /* @__PURE__ */ new Map();
  phoneToLid = /* @__PURE__ */ new Map();
  constructor(initialRecords = []) {
    for (const record of initialRecords) {
      this.lidToRecord.set(`${record.sessionId}::${record.lid}`, record);
      this.phoneToLid.set(`${record.sessionId}::${record.phoneWid}`, record.lid);
    }
  }
  normalizeLidKey(rawLid) {
    const trimmed = rawLid.trim();
    const atIdx = trimmed.lastIndexOf("@");
    const userRaw = atIdx === -1 ? trimmed : trimmed.slice(0, atIdx);
    const { user } = stripDeviceSuffix(userRaw);
    if (!user || !/^\d{5,25}$/.test(user)) {
      throw new Error(`Invalid WhatsApp LID identifier: ${rawLid}`);
    }
    return `${user}@lid`;
  }
  normalizePhoneKey(rawPhone) {
    const parsed = normalizeWaId(rawPhone);
    if (parsed.kind !== "direct") {
      throw new Error(`Expected direct phone WID (<phone>@c.us), received: ${rawPhone}`);
    }
    return parsed.neutralId;
  }
  upsertMapping(sessionId, rawLid, rawPhone, source = "inbound-envelope") {
    const lid = this.normalizeLidKey(rawLid);
    const phoneWid = this.normalizePhoneKey(rawPhone);
    const record = {
      sessionId,
      lid,
      phoneWid,
      source,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.lidToRecord.set(`${sessionId}::${lid}`, record);
    this.phoneToLid.set(`${sessionId}::${phoneWid}`, lid);
    return record;
  }
  resolveLidToPhone(sessionId, rawLid) {
    try {
      const lid = this.normalizeLidKey(rawLid);
      return this.lidToRecord.get(`${sessionId}::${lid}`)?.phoneWid;
    } catch {
      return void 0;
    }
  }
  resolvePhoneToLid(sessionId, rawPhone) {
    try {
      const phoneWid = this.normalizePhoneKey(rawPhone);
      return this.phoneToLid.get(`${sessionId}::${phoneWid}`);
    } catch {
      return void 0;
    }
  }
  resolveToNeutral(sessionId, rawIdentifier) {
    return normalizeWaId(rawIdentifier, (lid) => this.resolveLidToPhone(sessionId, lid));
  }
  harvestGroupParticipants(sessionId, participants) {
    const harvested = [];
    for (const participant of participants) {
      const candidateLid = participant.lid ?? (participant.id?.includes("@lid") ? participant.id : void 0);
      const candidatePhone = participant.phoneNumber ?? participant.jid ?? (participant.id && !participant.id.includes("@lid") ? participant.id : void 0);
      if (candidateLid && candidatePhone) {
        try {
          const rec = this.upsertMapping(
            sessionId,
            candidateLid,
            candidatePhone,
            "group-metadata-harvest"
          );
          harvested.push(rec);
        } catch {
        }
      }
    }
    return harvested;
  }
  listBySession(sessionId) {
    const all = Array.from(this.lidToRecord.values());
    if (!sessionId) return all;
    return all.filter((item) => item.sessionId === sessionId);
  }
};
var INITIAL_LID_MAPPINGS = [
  {
    sessionId: "sess-baileys-primary-01",
    lid: "198472910384712@lid",
    phoneWid: "6281190283741@c.us",
    source: "group-metadata-harvest",
    updatedAt: "2026-10-21T12:10:00.000Z"
  },
  {
    sessionId: "sess-baileys-primary-01",
    lid: "248192039481726@lid",
    phoneWid: "6281288391024@c.us",
    source: "inbound-envelope",
    updatedAt: "2026-10-21T12:24:15.000Z"
  },
  {
    sessionId: "sess-wwebjs-fallback-02",
    lid: "839102938471625@lid",
    phoneWid: "6285719283746@c.us",
    source: "contact-sync",
    updatedAt: "2026-10-21T12:35:00.000Z"
  }
];

// openwa-gateway/src/core/patches/upstream-patches.ts
var UPSTREAM_PROTOCOL_PATCHES = [
  {
    stepOrder: 2,
    id: "wwebjs-201832",
    scriptPath: "scripts/patch-wwebjs-201832.js",
    blobSha1: "639b661dac479cf4bda6efc0d481e88ef0392944",
    targetLibrary: "whatsapp-web.js",
    targetVersion: "1.34.7",
    targetFile: "node_modules/whatsapp-web.js/src/util/Injected/Utils.js",
    titleKey: "patch_wwebjs_201832",
    rootCause: "WhatsApp Web 2.3000.x refactored internal webpack module exports for Store.Msg and WidFactory.",
    unpatchedPattern: "window.Store.Msg.get(msgId)",
    patchedReplacement: "(window.Store.Msg.get(msgId) || window.Store.Msg.getMessagesById([msgId])?.messages?.[0])"
  },
  {
    stepOrder: 3,
    id: "wwebjs-newsletter-preview",
    scriptPath: "scripts/patch-wwebjs-newsletter-preview.js",
    blobSha1: "734ad20e58a5c1660a9f3afb7858ae9f8a8d70f3",
    targetLibrary: "whatsapp-web.js",
    targetVersion: "1.34.7",
    targetFile: "node_modules/whatsapp-web.js/src/structures/Channel.js",
    titleKey: "patch_wwebjs_newsletter_preview",
    rootCause: "Newsletter invite metadata returns preview picture paths without hydrating full Channel chat records.",
    unpatchedPattern: "this.ChannelMetadata.picture",
    patchedReplacement: "(this.ChannelMetadata?.picture ?? this.ChannelMetadata?.preview)"
  },
  {
    stepOrder: 4,
    id: "wwebjs-status",
    scriptPath: "scripts/patch-wwebjs-status.js",
    blobSha1: "b122369971de82fe1716c4c9dbf9436cf16f538d",
    targetLibrary: "whatsapp-web.js",
    targetVersion: "1.34.7",
    targetFile: "node_modules/whatsapp-web.js/src/Client.js",
    titleKey: "patch_wwebjs_status",
    rootCause: "Status/story broadcast sends require explicit status@broadcast Wid resolution and ephemeral ack bypass.",
    unpatchedPattern: 'chatId === "status@broadcast"',
    patchedReplacement: "window.WWebJS.isStatusBroadcast(chatId) && window.WWebJS.sendStatusMessage(chat, content, options)"
  },
  {
    stepOrder: 5,
    id: "wwebjs-ready-sync",
    scriptPath: "scripts/patch-wwebjs-ready-sync.js",
    blobSha1: "9badbd67200fc98f6164bbfbffda30ef658d6114",
    targetLibrary: "whatsapp-web.js",
    targetVersion: "1.34.7",
    targetFile: "node_modules/whatsapp-web.js/src/Client.js",
    titleKey: "patch_wwebjs_ready_sync",
    rootCause: "WhatsApp Web changed AppState.hasSynced emission timing, leaving sessions stuck in AUTHENTICATING.",
    unpatchedPattern: "window.AuthStore.AppState.hasSynced",
    patchedReplacement: '(window.AuthStore.AppState.hasSynced || window.AuthStore.AppState.state === "CONNECTED")'
  },
  {
    stepOrder: 6,
    id: "wwebjs-participant-arity",
    scriptPath: "scripts/patch-wwebjs-participant-arity.js",
    blobSha1: "d74890be25b8707f1c60f0e3ef9bf76bb15e42b7",
    targetLibrary: "whatsapp-web.js",
    targetVersion: "1.34.7",
    targetFile: "node_modules/whatsapp-web.js/src/structures/GroupChat.js",
    titleKey: "patch_wwebjs_participant_arity",
    rootCause: "Batch group participant mutations silently drop unresolved WIDs without reporting per-ID status.",
    unpatchedPattern: "await window.Store.GroupParticipants.addParticipants(chatWid, participantWids)",
    patchedReplacement: "await window.WWebJS.applyGroupParticipantsWithArityTruth(chatWid, participantWids)"
  },
  {
    stepOrder: 7,
    id: "wwebjs-block",
    scriptPath: "scripts/patch-wwebjs-block.js",
    blobSha1: "daa327e9159f81cf700facbd85f3db43488c6060",
    targetLibrary: "whatsapp-web.js",
    targetVersion: "1.34.7",
    targetFile: "node_modules/whatsapp-web.js/src/structures/Contact.js",
    titleKey: "patch_wwebjs_block",
    rootCause: "WhatsApp Web removed the legacy ContactCollection resolver used by block() and unblock() on LID contacts.",
    unpatchedPattern: "window.Store.Blocklist.blockContact(contact)",
    patchedReplacement: "window.Store.Blocklist.blockContact({ wid: window.Store.WidFactory.createWid(contactId) })"
  },
  {
    stepOrder: 8,
    id: "wwebjs-group-description",
    scriptPath: "scripts/patch-wwebjs-group-description.js",
    blobSha1: "e79518bc1fc7cafc2367eb8d0e1c021f95fb22ff",
    targetLibrary: "whatsapp-web.js",
    targetVersion: "1.34.7",
    targetFile: "node_modules/whatsapp-web.js/src/structures/GroupChat.js",
    titleKey: "patch_wwebjs_group_description",
    rootCause: "setGroupDescription job in WhatsApp Web now expects an options object instead of positional arguments.",
    unpatchedPattern: "window.Store.GroupUtils.setGroupDescription(chatWid, description, descId, prevDescId)",
    patchedReplacement: "window.Store.GroupUtils.setGroupDescription(chatWid, description, { descId, prevDescId })"
  },
  {
    stepOrder: 9,
    id: "wwebjs-media-id",
    scriptPath: "scripts/patch-wwebjs-media-id.js",
    blobSha1: "0d378f850dc6c46bf9b1d00a464273c780f4910d",
    targetLibrary: "whatsapp-web.js",
    targetVersion: "1.34.7",
    targetFile: "node_modules/whatsapp-web.js/src/util/Injected/Utils.js",
    titleKey: "patch_wwebjs_media_id",
    rootCause: "MediaPrep leaks a private media model id into the outgoing message payload, causing send rejection.",
    unpatchedPattern: "Object.assign(newMsg, mediaProps)",
    patchedReplacement: "const { id: _omitMediaId, ...safeMediaProps } = mediaProps; Object.assign(newMsg, safeMediaProps)"
  },
  {
    stepOrder: 10,
    id: "wwebjs-send-error",
    scriptPath: "scripts/patch-wwebjs-send-error.js",
    blobSha1: "45b17bfe971eb4dd134b5ad912442239563993d5",
    targetLibrary: "whatsapp-web.js",
    targetVersion: "1.34.7",
    targetFile: "node_modules/whatsapp-web.js/src/Client.js",
    titleKey: "patch_wwebjs_send_error",
    rootCause: 'Minified page exceptions surface in Puppeteer evaluate() as opaque "Evaluation failed: t: t".',
    unpatchedPattern: "return window.WWebJS.sendMessage(chat, message, options)",
    patchedReplacement: "try { return await window.WWebJS.sendMessage(chat, message, options); } catch (e) { throw new Error(e?.message || String(e)); }"
  },
  {
    stepOrder: 11,
    id: "baileys-appstate",
    scriptPath: "scripts/patch-baileys-appstate.js",
    blobSha1: "1a1a84ce8ea4a4c57cd3b4ec453c925249ba4b70",
    targetLibrary: "@whiskeysockets/baileys",
    targetVersion: "7.0.0-rc14",
    targetFile: "node_modules/@whiskeysockets/baileys/lib/Socket/chats.js",
    titleKey: "patch_baileys_appstate",
    rootCause: "Unbounded LTHash app-state resync loop spins CPU when WhatsApp serves a truncated snapshot.",
    unpatchedPattern: "while (hasMorePatches)",
    patchedReplacement: "for (let resyncPass = 0; hasMorePatches && resyncPass < MAX_APPSTATE_RESYNC_PASSES; resyncPass++)"
  },
  {
    stepOrder: 12,
    id: "baileys-newsletter-create",
    scriptPath: "scripts/patch-baileys-newsletter-create.js",
    blobSha1: "1f8eb5bdd20a5ccb0c60648f911aa0d708ad2a3c",
    targetLibrary: "@whiskeysockets/baileys",
    targetVersion: "7.0.0-rc14",
    targetFile: "node_modules/@whiskeysockets/baileys/lib/Socket/newsletter.js",
    titleKey: "patch_baileys_newsletter_create",
    rootCause: "WMEX GraphQL response for newsletter creation nests thread metadata under xwa2_newsletter_create.",
    unpatchedPattern: "result.data.xwa2_newsletter",
    patchedReplacement: "(result?.data?.xwa2_newsletter ?? result?.data?.xwa2_newsletter_create)"
  },
  {
    stepOrder: 13,
    id: "baileys-pairing",
    scriptPath: "scripts/patch-baileys-pairing.js",
    blobSha1: "3e4170eb4044e46fb0b3fa4bf2c171b139e04cab",
    targetLibrary: "@whiskeysockets/baileys",
    targetVersion: "7.0.0-rc14",
    targetFile: "node_modules/@whiskeysockets/baileys/lib/Socket/socket.js",
    titleKey: "patch_baileys_pairing",
    rootCause: "Pre-login companion_reg notification ACKs are dropped before creds.me is populated during 8-digit pairing.",
    unpatchedPattern: "if (!creds.me) return;",
    patchedReplacement: 'if (!creds.me && node.attrs.type !== "companion_reg") return; await sendAck(node);'
  }
];

// openwa-gateway/src/core/security/http-guards.ts
function checkEncodedNulGuard(originalUrl) {
  if (originalUrl.toLowerCase().includes("%00") || originalUrl.includes("\0")) {
    return {
      allowed: false,
      statusCode: 400,
      error: "Bad Request",
      message: "URL must not contain an encoded NUL",
      poolAllocated: "none"
    };
  }
  return null;
}
function checkTrailingSlashDeleteGuard(method, path) {
  const lowerPath = path.toLowerCase();
  if (method.toUpperCase() === "DELETE" && lowerPath.startsWith("/api/") && !lowerPath.startsWith("/api/ingress/") && lowerPath.endsWith("/")) {
    return {
      allowed: false,
      statusCode: 404,
      error: "Not Found",
      message: `Cannot DELETE ${path}`,
      poolAllocated: "none"
    };
  }
  return null;
}
function evaluateHttpEdgeGuards(input) {
  const qIdx = input.originalUrl.indexOf("?");
  const pathOnly = qIdx === -1 ? input.originalUrl : input.originalUrl.slice(0, qIdx);
  const nulError = checkEncodedNulGuard(input.originalUrl);
  if (nulError) return nulError;
  const deleteError = checkTrailingSlashDeleteGuard(input.method, pathOnly);
  if (deleteError) return deleteError;
  const encoding = (input.contentEncoding ?? "identity").trim().toLowerCase();
  if (encoding && encoding !== "identity") {
    return {
      allowed: false,
      statusCode: 415,
      error: "Unsupported Media Type",
      message: `Compressed request bodies (${encoding}) are refused before buffering (inflate: false)`,
      poolAllocated: "none"
    };
  }
  const maxBodyLimitBytes = input.maxBodyLimitBytes ?? 10 * 1024 * 1024;
  const totalBudgetBytes = input.totalBudgetBytes ?? 50 * 1024 * 1024;
  const unrecognizedPoolLimitBytes = Math.max(Math.floor(totalBudgetBytes * 0.25), maxBodyLimitBytes * 2);
  if (input.contentLengthBytes > maxBodyLimitBytes) {
    return {
      allowed: false,
      statusCode: 413,
      error: "Payload Too Large",
      message: `Request body (${input.contentLengthBytes} bytes) exceeds BODY_SIZE_LIMIT (${maxBodyLimitBytes} bytes)`,
      poolAllocated: "none"
    };
  }
  if (input.currentTotalInflightBytes + input.contentLengthBytes > totalBudgetBytes) {
    return {
      allowed: false,
      statusCode: 503,
      error: "Service Unavailable",
      message: "Aggregate in-flight body budget exhausted; Retry-After: 2",
      poolAllocated: "none"
    };
  }
  if (!input.recognizedApiKey && input.currentUnrecognizedInflightBytes + input.contentLengthBytes > unrecognizedPoolLimitBytes) {
    return {
      allowed: false,
      statusCode: 503,
      error: "Service Unavailable",
      message: "Unrecognized API key quarter-budget pool exhausted; Retry-After: 5",
      poolAllocated: "unrecognized-quarter-pool"
    };
  }
  return {
    allowed: true,
    statusCode: 200,
    error: "OK",
    message: "Request admitted through pre-parser HTTP surface guards",
    poolAllocated: input.recognizedApiKey ? "authenticated-full-budget" : "unrecognized-quarter-pool"
  };
}

// openwa-gateway/src/core/mcp/mcp-registry.ts
var OPENWA_MCP_TOOLS = [
  {
    name: "openwa_list_sessions",
    descriptionKey: "mcp_tool_list_sessions",
    readOnly: true,
    requiredRole: "READONLY",
    inputSchemaSummary: {}
  },
  {
    name: "openwa_resolve_identity",
    descriptionKey: "mcp_tool_resolve_identity",
    readOnly: true,
    requiredRole: "READONLY",
    inputSchemaSummary: {
      sessionId: "string (UUID or session key)",
      identifier: "string (raw JID, @lid, @s.whatsapp.net, or phone)",
      targetEngine: '"baileys" | "whatsapp-web.js"'
    }
  },
  {
    name: "openwa_send_text",
    descriptionKey: "mcp_tool_send_text",
    readOnly: false,
    requiredRole: "OPERATOR",
    inputSchemaSummary: {
      sessionId: "string",
      to: "string (neutral WID or @lid)",
      text: "string",
      quotedMessageId: "string (optional)"
    }
  },
  {
    name: "openwa_inspect_engine_parity",
    descriptionKey: "mcp_tool_inspect_parity",
    readOnly: true,
    requiredRole: "READONLY",
    inputSchemaSummary: {}
  }
];
function executeMcpToolCall(toolName, args, context) {
  if (!context.authenticated) {
    return {
      toolName,
      isError: true,
      auditAction: "API_KEY_AUTH_FAILED",
      payload: {
        statusCode: 401,
        error: "Unauthorized",
        message: "Valid X-API-Key or Bearer token required for /mcp Streamable-HTTP transport"
      }
    };
  }
  const def = OPENWA_MCP_TOOLS.find((t) => t.name === toolName);
  if (!def) {
    return {
      toolName,
      isError: true,
      payload: {
        statusCode: 404,
        error: "ToolNotFound",
        message: `Unknown MCP tool: ${toolName}`
      }
    };
  }
  if (context.readOnlyMode && !def.readOnly) {
    return {
      toolName,
      isError: true,
      auditAction: "API_KEY_AUTH_FAILED",
      payload: {
        statusCode: 403,
        error: "Forbidden",
        message: `Tool ${toolName} is disabled when MCP server runs in readOnly mode`
      }
    };
  }
  if (toolName === "openwa_list_sessions") {
    return {
      toolName,
      isError: false,
      auditAction: "MCP_TOOL_INVOKED",
      payload: {
        activeEngine: context.engineFactory.getCurrentEngine(),
        sessions: [
          {
            sessionId: "sess-baileys-primary-01",
            engine: "baileys",
            status: "ready",
            lidMappingsCached: context.lidStore.listBySession("sess-baileys-primary-01").length
          },
          {
            sessionId: "sess-wwebjs-fallback-02",
            engine: "whatsapp-web.js",
            status: "ready",
            lidMappingsCached: context.lidStore.listBySession("sess-wwebjs-fallback-02").length
          }
        ]
      }
    };
  }
  if (toolName === "openwa_resolve_identity") {
    const sessionId = String(args.sessionId ?? "sess-baileys-primary-01");
    const identifier = String(args.identifier ?? "198472910384712:14@lid");
    const targetEngine = args.targetEngine === "whatsapp-web.js" ? "whatsapp-web.js" : "baileys";
    const resolver = (lid) => context.lidStore.resolveLidToPhone(sessionId, lid);
    const parsed = normalizeWaId(identifier, resolver);
    const wireDialect = toEngineDialect(identifier, targetEngine, resolver);
    return {
      toolName,
      isError: false,
      auditAction: "MCP_TOOL_INVOKED",
      payload: {
        sessionId,
        rawInput: identifier,
        neutralWid: parsed.neutralId,
        kind: parsed.kind,
        resolvedViaLidStore: parsed.resolvedViaLidStore,
        targetEngine,
        engineWireJid: wireDialect
      }
    };
  }
  if (toolName === "openwa_send_text") {
    const sessionId = String(args.sessionId ?? "sess-baileys-primary-01");
    const to = String(args.to ?? "198472910384712@lid");
    const text = String(args.text ?? "Automated check from OpenWA MCP");
    const quotedMessageId = args.quotedMessageId ? String(args.quotedMessageId) : void 0;
    const engine = context.engineFactory.create({ sessionId, dbSessionId: sessionId });
    const result = engine.sendTextMessage(to, text, { quotedMessageId });
    return {
      toolName,
      isError: false,
      auditAction: "MCP_TOOL_INVOKED",
      payload: { ...result, sessionId, engine: engine.engineId }
    };
  }
  return {
    toolName,
    isError: false,
    auditAction: "MCP_TOOL_INVOKED",
    payload: {
      engines: context.engineFactory.getAvailableEngines()
    }
  };
}

// openwa-gateway/api/gateway-entry.ts
var lidStore = new LidMappingStore(INITIAL_LID_MAPPINGS);
var engineFactory = new EngineFactory({ engineType: "baileys", lidStore });
function handler(req, res) {
  const method = req.method ?? "GET";
  const originalUrl = req.url ?? "/api/v1/health";
  const contentEncoding = String(req.headers["content-encoding"] ?? "identity");
  const contentLengthBytes = Number.parseInt(String(req.headers["content-length"] ?? "0"), 10) || 0;
  const apiKeyHeader = String(req.headers["x-api-key"] ?? req.headers["authorization"] ?? "");
  const guard = evaluateHttpEdgeGuards({
    method,
    originalUrl,
    contentEncoding,
    contentLengthBytes,
    recognizedApiKey: apiKeyHeader.length > 0,
    currentTotalInflightBytes: 0,
    currentUnrecognizedInflightBytes: 0
  });
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!guard.allowed) {
    res.statusCode = guard.statusCode;
    res.end(
      JSON.stringify({
        statusCode: guard.statusCode,
        error: guard.error,
        message: guard.message
      })
    );
    return;
  }
  const parsedUrl = new URL(originalUrl, "http://localhost");
  const pathname = parsedUrl.pathname.toLowerCase();
  if (pathname === "/api/v1/engines" || pathname === "/api/engines") {
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        activeEngine: engineFactory.getCurrentEngine(),
        engines: engineFactory.getAvailableEngines()
      })
    );
    return;
  }
  if (pathname === "/api/v1/identity/resolve" || pathname === "/api/identity/resolve") {
    const rawId = parsedUrl.searchParams.get("id") ?? "198472910384712:14@lid";
    const sessionId = parsedUrl.searchParams.get("sessionId") ?? "sess-baileys-primary-01";
    try {
      const resolver = (lid) => lidStore.resolveLidToPhone(sessionId, lid);
      const parsed = normalizeWaId(rawId, resolver);
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          sessionId,
          raw: rawId,
          neutralId: parsed.neutralId,
          kind: parsed.kind,
          resolvedViaLidStore: parsed.resolvedViaLidStore,
          baileysDialect: toEngineDialect(rawId, "baileys", resolver),
          wwebjsDialect: toEngineDialect(rawId, "whatsapp-web.js", resolver)
        })
      );
    } catch (err) {
      res.statusCode = 400;
      res.end(
        JSON.stringify({
          statusCode: 400,
          error: "Bad Request",
          message: err instanceof Error ? err.message : String(err)
        })
      );
    }
    return;
  }
  if (pathname === "/api/v1/patches" || pathname === "/api/patches") {
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        totalPatches: UPSTREAM_PROTOCOL_PATCHES.length,
        patches: UPSTREAM_PROTOCOL_PATCHES
      })
    );
    return;
  }
  if (pathname === "/mcp" || pathname.startsWith("/api/mcp")) {
    const toolName = parsedUrl.searchParams.get("tool") ?? "openwa_list_sessions";
    const result = executeMcpToolCall(
      toolName,
      {
        sessionId: parsedUrl.searchParams.get("sessionId") ?? "sess-baileys-primary-01",
        identifier: parsedUrl.searchParams.get("id") ?? "198472910384712:14@lid"
      },
      {
        authenticated: true,
        engineFactory,
        lidStore
      }
    );
    res.statusCode = result.isError ? 400 : 200;
    res.end(
      JSON.stringify({
        server: { name: "openwa", version: "0.25.0" },
        availableTools: OPENWA_MCP_TOOLS,
        execution: result
      })
    );
    return;
  }
  res.statusCode = 200;
  res.end(
    JSON.stringify({
      status: "ok",
      service: "openwa-gateway",
      version: "0.25.0",
      reconstructedFrom: "rmyndharis/OpenWA",
      reaPolicyVersion: 44,
      activeEngine: engineFactory.getCurrentEngine(),
      endpoints: [
        "/api/v1/health",
        "/api/v1/engines",
        "/api/v1/identity/resolve?id=198472910384712:14@lid",
        "/api/v1/patches",
        "/mcp?tool=openwa_list_sessions"
      ]
    })
  );
}
export {
  handler as default
};
