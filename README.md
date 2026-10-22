# OpenWA Gateway Reconstruction (`morluto/rea` Policy Compliant)

Self-hosted WhatsApp HTTP API Gateway architecture and interactive protocol workstation reconstructed from `rmyndharis/OpenWA` (`v0.10.10` to `v0.25.0`, commit `173916c83b41e622f849ecd380bf36486dfd8cdf`) following the epistemic and evidence-provenance rules of [`morluto/rea`](https://github.com/morluto/rea).

## Reconstructed Subsystems

1. **Dual-Engine Anti-Corruption Layer (`src/core/engine/`)**:
   - Pluggable `IWhatsAppEngine` contract supporting `@whiskeysockets/baileys` (`7.0.0-rc14`, Noise WebSocket) and `whatsapp-web.js` (`1.34.7`, Puppeteer CDP).
   - Path-traversal protection (`isSafeSessionName`), dual-engine `0700` credential directory provisioning, and dual-engine `purgeSessionData()` cleanup.
   - Multi-replica lease failover (`evaluateSessionTakeover` with `2000ms` Chromium stagger and `2x` TTL stranded detection).
2. **Neutral WID/LID Identity Dialect & Bidirectional Store (`src/core/identity/`)**:
   - Normalizes `@s.whatsapp.net` and `:device` suffixes into neutral `<phone>@c.us`, `<id>@g.us`, `<lid>@lid`, `status@broadcast`, and `<id>@newsletter` identifiers.
   - `LidMappingStore` resolves privacy `@lid` identifiers to `<phone>@c.us` and translates back to engine-specific wire dialects (`toEngineDialect`).
3. **12-Step Upstream Protocol Patch Pipeline (`src/core/patches/` & `scripts/postinstall.js`)**:
   - Full specification and signature verifier for all 9 `whatsapp-web.js` patches and 3 `@whiskeysockets/baileys` patches, plus `sanitizePostinstallEnv` stripping `npm_config_allow_scripts` for npm 11 compatibility.
4. **Hardened HTTP Edge, HMAC-SHA256 Auth, Durable Webhook Outbox & MCP Server (`src/core/security/`, `src/core/webhook/`, `src/core/mcp/`, `api/gateway.ts`)**:
   - `hashApiKey(rawKey, pepper)` (`HMAC-SHA256` with server-side pepper + `SHA-256` fallback) and usage-invariant `apiKeyAuthorizationFingerprint()`.
   - Pre-parser in-flight body budget with 25% unrecognized-key pool, `%00` encoded NUL refusal (`400`), trailing-slash `DELETE` refusal (`404`), and `inflate: false` compressed-body refusal (`415`).
   - Durable `WebhookOutboxStore` with `(webhookId, idempotencyKey)` deduplication and 7-day settled pruning.
   - Streamable-HTTP Model Context Protocol (`/mcp`) tool registry.

## Commands

```bash
npm install
npm test
npm run build
```
