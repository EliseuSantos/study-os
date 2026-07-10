/* oxlint-disable no-console */
// Generates the VAPID key pair for web push. Run from apps/worker:
//
//   bun run scripts/gen-vapid.ts
//
// Paste the output into `.dev.vars` for local dev, or feed it to
// `wrangler secret put VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`.

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
])) as CryptoKeyPair;

const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);

console.log(`VAPID_PUBLIC_KEY=${base64url(publicRaw)}`);
console.log(`VAPID_PRIVATE_KEY=${JSON.stringify(privateJwk)}`);
console.log('VAPID_SUBJECT=mailto:you@example.com');
