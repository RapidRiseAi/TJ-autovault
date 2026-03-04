import 'server-only';

import { createSign } from 'crypto';

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

function readVapidConfig(): VapidConfig {
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
  const { subject, privateKey } = readVapidConfig();

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
    key: privateKey,
    dsaEncoding: 'ieee-p1363'
  });

  return `${unsignedToken}.${toBase64Url(signature)}`;
}

export function getVapidPublicKeyForHeader() {
  const { publicKey } = readVapidConfig();
  return publicKey;
}
