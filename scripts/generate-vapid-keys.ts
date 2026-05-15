/**
 * Run once: `npm run push:keys`
 * Outputs a fresh VAPID keypair. Copy both lines into .env.
 *
 * IMPORTANT: keep these keys stable across deploys — if you regenerate them,
 * every existing browser subscription becomes invalid (users would need to
 * re-subscribe).
 */
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log("");
console.log("# Add these to .env (and to your production secrets):");
console.log("");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log(`VAPID_SUBJECT=mailto:admin@yourdomain.com   # change to a real contact`);
console.log("");
