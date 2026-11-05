// Prints a new VAPID key pair for push notifications. Put the lines into .env.
// Usage: npm run push:keys   (on the server: docker compose ... run --rm worker npx tsx scripts/vapid-keys.ts)
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY="${keys.publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${keys.privateKey}"`);
