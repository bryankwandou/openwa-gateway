export interface HttpGuardEvaluation {
  allowed: boolean;
  statusCode: 200 | 400 | 404 | 413 | 415 | 503;
  error: string;
  message: string;
  poolAllocated: 'authenticated-full-budget' | 'unrecognized-quarter-pool' | 'none';
}

export function checkEncodedNulGuard(originalUrl: string): HttpGuardEvaluation | null {
  if (originalUrl.toLowerCase().includes('%00') || originalUrl.includes('\0')) {
    return {
      allowed: false,
      statusCode: 400,
      error: 'Bad Request',
      message: 'URL must not contain an encoded NUL',
      poolAllocated: 'none',
    };
  }
  return null;
}

export function checkTrailingSlashDeleteGuard(method: string, path: string): HttpGuardEvaluation | null {
  const lowerPath = path.toLowerCase();
  if (
    method.toUpperCase() === 'DELETE' &&
    lowerPath.startsWith('/api/') &&
    !lowerPath.startsWith('/api/ingress/') &&
    lowerPath.endsWith('/')
  ) {
    return {
      allowed: false,
      statusCode: 404,
      error: 'Not Found',
      message: `Cannot DELETE ${path}`,
      poolAllocated: 'none',
    };
  }
  return null;
}

export interface InflightBudgetInput {
  method: string;
  originalUrl: string;
  contentEncoding?: string;
  contentLengthBytes: number;
  recognizedApiKey: boolean;
  currentTotalInflightBytes: number;
  currentUnrecognizedInflightBytes: number;
  maxBodyLimitBytes?: number;
  totalBudgetBytes?: number;
}

/**
 * Reconstructed pre-parser HTTP surface pipeline from `rmyndharis/OpenWA/src/configure-app.ts`
 * (`a417d466e990179d20b09e7e8b5d07781fabd1f0`).
 */
export function evaluateHttpEdgeGuards(input: InflightBudgetInput): HttpGuardEvaluation {
  const qIdx = input.originalUrl.indexOf('?');
  const pathOnly = qIdx === -1 ? input.originalUrl : input.originalUrl.slice(0, qIdx);

  const nulError = checkEncodedNulGuard(input.originalUrl);
  if (nulError) return nulError;

  const deleteError = checkTrailingSlashDeleteGuard(input.method, pathOnly);
  if (deleteError) return deleteError;

  const encoding = (input.contentEncoding ?? 'identity').trim().toLowerCase();
  if (encoding && encoding !== 'identity') {
    return {
      allowed: false,
      statusCode: 415,
      error: 'Unsupported Media Type',
      message: `Compressed request bodies (${encoding}) are refused before buffering (inflate: false)`,
      poolAllocated: 'none',
    };
  }

  const maxBodyLimitBytes = input.maxBodyLimitBytes ?? 10 * 1024 * 1024;
  const totalBudgetBytes = input.totalBudgetBytes ?? 50 * 1024 * 1024;
  const unrecognizedPoolLimitBytes = Math.max(Math.floor(totalBudgetBytes * 0.25), maxBodyLimitBytes * 2);

  if (input.contentLengthBytes > maxBodyLimitBytes) {
    return {
      allowed: false,
      statusCode: 413,
      error: 'Payload Too Large',
      message: `Request body (${input.contentLengthBytes} bytes) exceeds BODY_SIZE_LIMIT (${maxBodyLimitBytes} bytes)`,
      poolAllocated: 'none',
    };
  }

  if (input.currentTotalInflightBytes + input.contentLengthBytes > totalBudgetBytes) {
    return {
      allowed: false,
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'Aggregate in-flight body budget exhausted; Retry-After: 2',
      poolAllocated: 'none',
    };
  }

  if (
    !input.recognizedApiKey &&
    input.currentUnrecognizedInflightBytes + input.contentLengthBytes > unrecognizedPoolLimitBytes
  ) {
    return {
      allowed: false,
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'Unrecognized API key quarter-budget pool exhausted; Retry-After: 5',
      poolAllocated: 'unrecognized-quarter-pool',
    };
  }

  return {
    allowed: true,
    statusCode: 200,
    error: 'OK',
    message: 'Request admitted through pre-parser HTTP surface guards',
    poolAllocated: input.recognizedApiKey ? 'authenticated-full-budget' : 'unrecognized-quarter-pool',
  };
}
