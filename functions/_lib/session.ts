import { getCookie } from './http';

export type AdminSession = {
  token: string;
  login: string;
  ts: number;
};

const sessionCookie = 'kb_admin_session';
const stateCookie = 'kb_oauth_state';

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return base64Url(data);
}

async function sessionKey(secret: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptSession(session: AdminSession, secret: string) {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const key = await sessionKey(secret);
  const encoded = new TextEncoder().encode(JSON.stringify(session));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded));
  const packed = new Uint8Array(iv.length + encrypted.length);
  packed.set(iv, 0);
  packed.set(encrypted, iv.length);
  return base64Url(packed);
}

export async function decryptSession(value: string, secret: string): Promise<AdminSession | null> {
  try {
    const packed = fromBase64Url(value);
    const iv = packed.slice(0, 12);
    const encrypted = packed.slice(12);
    const key = await sessionKey(secret);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
    return JSON.parse(new TextDecoder().decode(decrypted)) as AdminSession;
  } catch {
    return null;
  }
}

function cookieFlags(request: Request, maxAge: number) {
  const url = new URL(request.url);
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

export function makeStateCookie(request: Request) {
  const state = randomToken(24);
  return {
    state,
    header: `${stateCookie}=${encodeURIComponent(state)}; ${cookieFlags(request, 600)}`,
  };
}

export function readStateCookie(request: Request) {
  return getCookie(request, stateCookie);
}

export function clearStateCookie(request: Request) {
  return `${stateCookie}=; ${cookieFlags(request, 0)}`;
}

export async function makeSessionCookie(request: Request, session: AdminSession, secret: string) {
  const encrypted = await encryptSession(session, secret);
  return `${sessionCookie}=${encodeURIComponent(encrypted)}; ${cookieFlags(request, 60 * 60 * 24 * 7)}`;
}

export function clearSessionCookie(request: Request) {
  return `${sessionCookie}=; ${cookieFlags(request, 0)}`;
}

export async function readSession(request: Request, secret: string) {
  const value = getCookie(request, sessionCookie);
  if (!value) return null;
  return decryptSession(value, secret);
}

