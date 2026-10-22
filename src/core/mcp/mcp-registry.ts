import { normalizeWaId, toEngineDialect, type SupportedEngineType } from '../identity/wa-id.ts';
import type { LidMappingStore } from '../identity/lid-mapping-store.ts';
import type { EngineFactory } from '../engine/engine-factory.ts';

export interface McpToolDefinition {
  name: string;
  descriptionKey: string;
  readOnly: boolean;
  requiredRole: 'READONLY' | 'OPERATOR' | 'ADMIN';
  inputSchemaSummary: Record<string, string>;
}

export const OPENWA_MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'openwa_list_sessions',
    descriptionKey: 'mcp_tool_list_sessions',
    readOnly: true,
    requiredRole: 'READONLY',
    inputSchemaSummary: {},
  },
  {
    name: 'openwa_resolve_identity',
    descriptionKey: 'mcp_tool_resolve_identity',
    readOnly: true,
    requiredRole: 'READONLY',
    inputSchemaSummary: {
      sessionId: 'string (UUID or session key)',
      identifier: 'string (raw JID, @lid, @s.whatsapp.net, or phone)',
      targetEngine: '"baileys" | "whatsapp-web.js"',
    },
  },
  {
    name: 'openwa_send_text',
    descriptionKey: 'mcp_tool_send_text',
    readOnly: false,
    requiredRole: 'OPERATOR',
    inputSchemaSummary: {
      sessionId: 'string',
      to: 'string (neutral WID or @lid)',
      text: 'string',
      quotedMessageId: 'string (optional)',
    },
  },
  {
    name: 'openwa_inspect_engine_parity',
    descriptionKey: 'mcp_tool_inspect_parity',
    readOnly: true,
    requiredRole: 'READONLY',
    inputSchemaSummary: {},
  },
];

export interface McpToolExecutionResult {
  toolName: string;
  isError: boolean;
  auditAction?: 'API_KEY_AUTH_FAILED' | 'MCP_TOOL_INVOKED';
  payload: Record<string, unknown>;
}

export function executeMcpToolCall(
  toolName: string,
  args: Record<string, unknown>,
  context: {
    authenticated: boolean;
    readOnlyMode?: boolean;
    engineFactory: EngineFactory;
    lidStore: LidMappingStore;
  },
): McpToolExecutionResult {
  if (!context.authenticated) {
    return {
      toolName,
      isError: true,
      auditAction: 'API_KEY_AUTH_FAILED',
      payload: {
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Valid X-API-Key or Bearer token required for /mcp Streamable-HTTP transport',
      },
    };
  }

  const def = OPENWA_MCP_TOOLS.find(t => t.name === toolName);
  if (!def) {
    return {
      toolName,
      isError: true,
      payload: {
        statusCode: 404,
        error: 'ToolNotFound',
        message: `Unknown MCP tool: ${toolName}`,
      },
    };
  }

  if (context.readOnlyMode && !def.readOnly) {
    return {
      toolName,
      isError: true,
      auditAction: 'API_KEY_AUTH_FAILED',
      payload: {
        statusCode: 403,
        error: 'Forbidden',
        message: `Tool ${toolName} is disabled when MCP server runs in readOnly mode`,
      },
    };
  }

  if (toolName === 'openwa_list_sessions') {
    return {
      toolName,
      isError: false,
      auditAction: 'MCP_TOOL_INVOKED',
      payload: {
        activeEngine: context.engineFactory.getCurrentEngine(),
        sessions: [
          {
            sessionId: 'sess-baileys-primary-01',
            engine: 'baileys',
            status: 'ready',
            lidMappingsCached: context.lidStore.listBySession('sess-baileys-primary-01').length,
          },
          {
            sessionId: 'sess-wwebjs-fallback-02',
            engine: 'whatsapp-web.js',
            status: 'ready',
            lidMappingsCached: context.lidStore.listBySession('sess-wwebjs-fallback-02').length,
          },
        ],
      },
    };
  }

  if (toolName === 'openwa_resolve_identity') {
    const sessionId = String(args.sessionId ?? 'sess-baileys-primary-01');
    const identifier = String(args.identifier ?? '198472910384712:14@lid');
    const targetEngine = (args.targetEngine === 'whatsapp-web.js' ? 'whatsapp-web.js' : 'baileys') as SupportedEngineType;
    const resolver = (lid: string) => context.lidStore.resolveLidToPhone(sessionId, lid);
    const parsed = normalizeWaId(identifier, resolver);
    const wireDialect = toEngineDialect(identifier, targetEngine, resolver);
    return {
      toolName,
      isError: false,
      auditAction: 'MCP_TOOL_INVOKED',
      payload: {
        sessionId,
        rawInput: identifier,
        neutralWid: parsed.neutralId,
        kind: parsed.kind,
        resolvedViaLidStore: parsed.resolvedViaLidStore,
        targetEngine,
        engineWireJid: wireDialect,
      },
    };
  }

  if (toolName === 'openwa_send_text') {
    const sessionId = String(args.sessionId ?? 'sess-baileys-primary-01');
    const to = String(args.to ?? '198472910384712@lid');
    const text = String(args.text ?? 'Automated check from OpenWA MCP');
    const quotedMessageId = args.quotedMessageId ? String(args.quotedMessageId) : undefined;
    const engine = context.engineFactory.create({ sessionId, dbSessionId: sessionId });
    const result = engine.sendTextMessage(to, text, { quotedMessageId });
    return {
      toolName,
      isError: false,
      auditAction: 'MCP_TOOL_INVOKED',
      payload: { ...result, sessionId, engine: engine.engineId },
    };
  }

  return {
    toolName,
    isError: false,
    auditAction: 'MCP_TOOL_INVOKED',
    payload: {
      engines: context.engineFactory.getAvailableEngines(),
    },
  };
}
