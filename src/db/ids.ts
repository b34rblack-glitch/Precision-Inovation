import * as Crypto from 'expo-crypto';

export function newId(): string {
  return Crypto.randomUUID();
}

export function now(): Date {
  return new Date();
}
