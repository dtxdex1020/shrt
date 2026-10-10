import { randomInt } from 'node:crypto';

const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/l/I

export const SLUG_PATTERN = /^[A-Za-z0-9_-]{3,40}$/;

// Paths the app uses itself, plus a few that would be confusing as short links.
export const RESERVED = new Set(['api', 'healthz', 'favicon.ico', 'robots.txt', 'admin', 'static']);

export function randomSlug(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function isReserved(slug: string): boolean {
  return RESERVED.has(slug.toLowerCase());
}
