export interface UpstreamPatchSpec {
  stepOrder: number;
  id: string;
  scriptPath: string;
  blobSha1: string;
  targetLibrary: 'whatsapp-web.js' | '@whiskeysockets/baileys';
  targetVersion: string;
  targetFile: string;
  titleKey: string;
  rootCause: string;
  unpatchedPattern: string;
  patchedReplacement: string;
}

/**
 * Strip `npm_config_allow_scripts` from lifecycle environments so nested `npm ci` calls
 * under npm 11 do not abort with `EALLOWSCRIPTS` (`scripts/postinstall.js` lines 353-361).
 */
export function sanitizePostinstallEnv(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const clean: Record<string, string | undefined> = { ...env };
  for (const key of Object.keys(clean)) {
    if (/^npm_config_allow[_-]scripts$/i.test(key)) {
      delete clean[key];
    }
  }
  return clean;
}

export const UPSTREAM_PROTOCOL_PATCHES: UpstreamPatchSpec[] = [
  {
    stepOrder: 2,
    id: 'wwebjs-201832',
    scriptPath: 'scripts/patch-wwebjs-201832.js',
    blobSha1: '639b661dac479cf4bda6efc0d481e88ef0392944',
    targetLibrary: 'whatsapp-web.js',
    targetVersion: '1.34.7',
    targetFile: 'node_modules/whatsapp-web.js/src/util/Injected/Utils.js',
    titleKey: 'patch_wwebjs_201832',
    rootCause: 'WhatsApp Web 2.3000.x refactored internal webpack module exports for Store.Msg and WidFactory.',
    unpatchedPattern: 'window.Store.Msg.get(msgId)',
    patchedReplacement: '(window.Store.Msg.get(msgId) || window.Store.Msg.getMessagesById([msgId])?.messages?.[0])',
  },
  {
    stepOrder: 3,
    id: 'wwebjs-newsletter-preview',
    scriptPath: 'scripts/patch-wwebjs-newsletter-preview.js',
    blobSha1: '734ad20e58a5c1660a9f3afb7858ae9f8a8d70f3',
    targetLibrary: 'whatsapp-web.js',
    targetVersion: '1.34.7',
    targetFile: 'node_modules/whatsapp-web.js/src/structures/Channel.js',
    titleKey: 'patch_wwebjs_newsletter_preview',
    rootCause: 'Newsletter invite metadata returns preview picture paths without hydrating full Channel chat records.',
    unpatchedPattern: 'this.ChannelMetadata.picture',
    patchedReplacement: '(this.ChannelMetadata?.picture ?? this.ChannelMetadata?.preview)',
  },
  {
    stepOrder: 4,
    id: 'wwebjs-status',
    scriptPath: 'scripts/patch-wwebjs-status.js',
    blobSha1: 'b122369971de82fe1716c4c9dbf9436cf16f538d',
    targetLibrary: 'whatsapp-web.js',
    targetVersion: '1.34.7',
    targetFile: 'node_modules/whatsapp-web.js/src/Client.js',
    titleKey: 'patch_wwebjs_status',
    rootCause: 'Status/story broadcast sends require explicit status@broadcast Wid resolution and ephemeral ack bypass.',
    unpatchedPattern: 'chatId === "status@broadcast"',
    patchedReplacement: 'window.WWebJS.isStatusBroadcast(chatId) && window.WWebJS.sendStatusMessage(chat, content, options)',
  },
  {
    stepOrder: 5,
    id: 'wwebjs-ready-sync',
    scriptPath: 'scripts/patch-wwebjs-ready-sync.js',
    blobSha1: '9badbd67200fc98f6164bbfbffda30ef658d6114',
    targetLibrary: 'whatsapp-web.js',
    targetVersion: '1.34.7',
    targetFile: 'node_modules/whatsapp-web.js/src/Client.js',
    titleKey: 'patch_wwebjs_ready_sync',
    rootCause: 'WhatsApp Web changed AppState.hasSynced emission timing, leaving sessions stuck in AUTHENTICATING.',
    unpatchedPattern: 'window.AuthStore.AppState.hasSynced',
    patchedReplacement: '(window.AuthStore.AppState.hasSynced || window.AuthStore.AppState.state === "CONNECTED")',
  },
  {
    stepOrder: 6,
    id: 'wwebjs-participant-arity',
    scriptPath: 'scripts/patch-wwebjs-participant-arity.js',
    blobSha1: 'd74890be25b8707f1c60f0e3ef9bf76bb15e42b7',
    targetLibrary: 'whatsapp-web.js',
    targetVersion: '1.34.7',
    targetFile: 'node_modules/whatsapp-web.js/src/structures/GroupChat.js',
    titleKey: 'patch_wwebjs_participant_arity',
    rootCause: 'Batch group participant mutations silently drop unresolved WIDs without reporting per-ID status.',
    unpatchedPattern: 'await window.Store.GroupParticipants.addParticipants(chatWid, participantWids)',
    patchedReplacement: 'await window.WWebJS.applyGroupParticipantsWithArityTruth(chatWid, participantWids)',
  },
  {
    stepOrder: 7,
    id: 'wwebjs-block',
    scriptPath: 'scripts/patch-wwebjs-block.js',
    blobSha1: 'daa327e9159f81cf700facbd85f3db43488c6060',
    targetLibrary: 'whatsapp-web.js',
    targetVersion: '1.34.7',
    targetFile: 'node_modules/whatsapp-web.js/src/structures/Contact.js',
    titleKey: 'patch_wwebjs_block',
    rootCause: 'WhatsApp Web removed the legacy ContactCollection resolver used by block() and unblock() on LID contacts.',
    unpatchedPattern: 'window.Store.Blocklist.blockContact(contact)',
    patchedReplacement: 'window.Store.Blocklist.blockContact({ wid: window.Store.WidFactory.createWid(contactId) })',
  },
  {
    stepOrder: 8,
    id: 'wwebjs-group-description',
    scriptPath: 'scripts/patch-wwebjs-group-description.js',
    blobSha1: 'e79518bc1fc7cafc2367eb8d0e1c021f95fb22ff',
    targetLibrary: 'whatsapp-web.js',
    targetVersion: '1.34.7',
    targetFile: 'node_modules/whatsapp-web.js/src/structures/GroupChat.js',
    titleKey: 'patch_wwebjs_group_description',
    rootCause: 'setGroupDescription job in WhatsApp Web now expects an options object instead of positional arguments.',
    unpatchedPattern: 'window.Store.GroupUtils.setGroupDescription(chatWid, description, descId, prevDescId)',
    patchedReplacement: 'window.Store.GroupUtils.setGroupDescription(chatWid, description, { descId, prevDescId })',
  },
  {
    stepOrder: 9,
    id: 'wwebjs-media-id',
    scriptPath: 'scripts/patch-wwebjs-media-id.js',
    blobSha1: '0d378f850dc6c46bf9b1d00a464273c780f4910d',
    targetLibrary: 'whatsapp-web.js',
    targetVersion: '1.34.7',
    targetFile: 'node_modules/whatsapp-web.js/src/util/Injected/Utils.js',
    titleKey: 'patch_wwebjs_media_id',
    rootCause: 'MediaPrep leaks a private media model id into the outgoing message payload, causing send rejection.',
    unpatchedPattern: 'Object.assign(newMsg, mediaProps)',
    patchedReplacement: 'const { id: _omitMediaId, ...safeMediaProps } = mediaProps; Object.assign(newMsg, safeMediaProps)',
  },
  {
    stepOrder: 10,
    id: 'wwebjs-send-error',
    scriptPath: 'scripts/patch-wwebjs-send-error.js',
    blobSha1: '45b17bfe971eb4dd134b5ad912442239563993d5',
    targetLibrary: 'whatsapp-web.js',
    targetVersion: '1.34.7',
    targetFile: 'node_modules/whatsapp-web.js/src/Client.js',
    titleKey: 'patch_wwebjs_send_error',
    rootCause: 'Minified page exceptions surface in Puppeteer evaluate() as opaque "Evaluation failed: t: t".',
    unpatchedPattern: 'return window.WWebJS.sendMessage(chat, message, options)',
    patchedReplacement: 'try { return await window.WWebJS.sendMessage(chat, message, options); } catch (e) { throw new Error(e?.message || String(e)); }',
  },
  {
    stepOrder: 11,
    id: 'baileys-appstate',
    scriptPath: 'scripts/patch-baileys-appstate.js',
    blobSha1: '1a1a84ce8ea4a4c57cd3b4ec453c925249ba4b70',
    targetLibrary: '@whiskeysockets/baileys',
    targetVersion: '7.0.0-rc14',
    targetFile: 'node_modules/@whiskeysockets/baileys/lib/Socket/chats.js',
    titleKey: 'patch_baileys_appstate',
    rootCause: 'Unbounded LTHash app-state resync loop spins CPU when WhatsApp serves a truncated snapshot.',
    unpatchedPattern: 'while (hasMorePatches)',
    patchedReplacement: 'for (let resyncPass = 0; hasMorePatches && resyncPass < MAX_APPSTATE_RESYNC_PASSES; resyncPass++)',
  },
  {
    stepOrder: 12,
    id: 'baileys-newsletter-create',
    scriptPath: 'scripts/patch-baileys-newsletter-create.js',
    blobSha1: '1f8eb5bdd20a5ccb0c60648f911aa0d708ad2a3c',
    targetLibrary: '@whiskeysockets/baileys',
    targetVersion: '7.0.0-rc14',
    targetFile: 'node_modules/@whiskeysockets/baileys/lib/Socket/newsletter.js',
    titleKey: 'patch_baileys_newsletter_create',
    rootCause: 'WMEX GraphQL response for newsletter creation nests thread metadata under xwa2_newsletter_create.',
    unpatchedPattern: 'result.data.xwa2_newsletter',
    patchedReplacement: '(result?.data?.xwa2_newsletter ?? result?.data?.xwa2_newsletter_create)',
  },
  {
    stepOrder: 13,
    id: 'baileys-pairing',
    scriptPath: 'scripts/patch-baileys-pairing.js',
    blobSha1: '3e4170eb4044e46fb0b3fa4bf2c171b139e04cab',
    targetLibrary: '@whiskeysockets/baileys',
    targetVersion: '7.0.0-rc14',
    targetFile: 'node_modules/@whiskeysockets/baileys/lib/Socket/socket.js',
    titleKey: 'patch_baileys_pairing',
    rootCause: 'Pre-login companion_reg notification ACKs are dropped before creds.me is populated during 8-digit pairing.',
    unpatchedPattern: 'if (!creds.me) return;',
    patchedReplacement: 'if (!creds.me && node.attrs.type !== "companion_reg") return; await sendAck(node);',
  },
];

export type PatchVerificationState = 'patched' | 'unpatched-pristine' | 'half-patched-fatal';

export interface PatchVerificationResult {
  patchId: string;
  state: PatchVerificationState;
  exitCode: 0 | 1;
  detail: string;
}

/**
 * Evaluate a target source snippet against a patch specification using the `--best-effort` semantics
 * from `scripts/postinstall.js`:
 * - Already contains `patchedReplacement` -> `'patched'` (exit 0)
 * - Contains `unpatchedPattern` cleanly -> `'unpatched-pristine'` (exit 0 under `--best-effort`, ready to apply)
 * - Contains neither -> `'half-patched-fatal'` (exit 1 even under `--best-effort`; dependency drift or partial hunk)
 */
export function verifyUpstreamPatchTarget(
  spec: UpstreamPatchSpec,
  sourceContent: string,
  bestEffort = true,
): PatchVerificationResult {
  if (sourceContent.includes(spec.patchedReplacement)) {
    return {
      patchId: spec.id,
      state: 'patched',
      exitCode: 0,
      detail: `${spec.targetFile} contains verified replacement signature`,
    };
  }
  if (sourceContent.includes(spec.unpatchedPattern)) {
    return {
      patchId: spec.id,
      state: 'unpatched-pristine',
      exitCode: bestEffort ? 0 : 1,
      detail: `${spec.targetFile} matches pristine upstream ${spec.targetVersion} target hunk`,
    };
  }
  return {
    patchId: spec.id,
    state: 'half-patched-fatal',
    exitCode: 1,
    detail: `${spec.targetFile} matches neither pristine nor patched signature; refusing half-patched tree`,
  };
}
