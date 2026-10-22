import { hmacSha256Hex } from './sha256.ts';

const PIN_PEPPER = 'openwa-local-security-pin-v1';

export function isValidSixDigitPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

export function hashOperatorPin(pin: string): string {
  if (!isValidSixDigitPin(pin)) {
    throw new Error('Operator PIN must be exactly 6 numeric digits');
  }
  return hmacSha256Hex(PIN_PEPPER, pin);
}

export function verifyOperatorPin(candidatePin: string, storedPinHash: string): boolean {
  if (!isValidSixDigitPin(candidatePin)) return false;
  return hmacSha256Hex(PIN_PEPPER, candidatePin) === storedPinHash;
}
