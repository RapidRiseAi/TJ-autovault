import 'server-only';

import { createPrivateKey, createSign } from 'crypto';

type VapidConfig = {
  subject: string;
  publicKey: string;
  privateKey: string;
};

function toBase64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, 'base64');
}

function decodePublicKeyCoordinates(publicKey: string) {
  const bytes = fromBase64Url(publicKey);
  if (bytes.length !== 65 || bytes[0] !== 0x04) {
    throw new Error('NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY must be an uncompressed P-256 public key');
  }

  return {
    x: toBase64Url(bytes.subarray(1, 33)),
    y: toBase64Url(bytes.subarray(33, 65))
  };
}

export function readVapidConfig(): VapidConfig {
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;

  if (!subject || !publicKey || !privateKey) {
    throw new Error('Missing WEB_PUSH_VAPID_SUBJECT, NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY, or WEB_PUSH_VAPID_PRIVATE_KEY');
  }

  return { subject, publicKey, privateKey };
}

export function getPublicVapidKey() {
  return process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY ?? '';
}

export function buildVapidAuthorization(audience: string) {
  const { subject, publicKey, privateKey } = readVapidConfig();
  const { x, y } = decodePublicKeyCoordinates(publicKey);

  const keyObject = createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: privateKey,
      x,
      y
    },
    format: 'jwk'
  });

  const header = { alg: 'ES256', typ: 'JWT' };
  const claims = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
    sub: subject
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedClaims = toBase64Url(JSON.stringify(claims));
  const unsignedToken = `${encodedHeader}.${encodedClaims}`;

  const signer = createSign('SHA256');
  signer.update(unsignedToken);
  signer.end();

  const signature = signer.sign({
    key: keyObject,
    dsaEncoding: 'ieee-p1363'
  });

  return `${unsignedToken}.${toBase64Url(signature)}`;
}

export function getVapidPublicKeyForHeader() {
  const { publicKey } = readVapidConfig();
  return publicKey;
}
