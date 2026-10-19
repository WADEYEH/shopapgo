// Encrypts and decrypts the daily database backup (C23; docs/ops/runbook.md section 6). Node's own crypto only.
//
// The repository is public, so the backup GitHub keeps for 90 days must be unreadable without the owner's key: a new
// random AES-256-GCM key per file, wrapped with the owner's RSA-4096 public key (RSA-OAEP, SHA-256). The public key is
// in the repo (commerce/backup/backup-public-key.pem); the private key exists only where the owner keeps it.
//
//   node scripts/backup-crypt.mjs keygen  <private-key-out.pem> <public-key-out.pem>
//   node scripts/backup-crypt.mjs encrypt <public-key.pem> <backup.sql> <backup.sql.enc>
//   node scripts/backup-crypt.mjs decrypt <private-key.pem> <backup.sql.enc> <backup.sql>
//
// File: "APGO-BACKUP-1\n", one JSON line { alg, key, iv, tag } (base64), then the ciphertext. The first two lines are
// authenticated too (GCM additional data), so a changed header fails like a changed body.
import { constants, createCipheriv, createDecipheriv, createHash, generateKeyPairSync, privateDecrypt, publicEncrypt, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const MAGIC = "APGO-BACKUP-1\n";
const ALG = "RSA-OAEP-SHA256+AES-256-GCM";
const OAEP = { padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" };

export function generateKeys() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 4096,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { privateKey, publicKey };
}

export const fingerprint = (publicKeyPem) => createHash("sha256").update(publicKeyPem.trim()).digest("hex").slice(0, 16);

export function encrypt(publicKeyPem, plain) {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const head = { alg: ALG, key: publicEncrypt({ key: publicKeyPem, ...OAEP }, key).toString("base64"), iv: iv.toString("base64") };
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(MAGIC + JSON.stringify(head)));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  const header = JSON.stringify({ ...head, tag: cipher.getAuthTag().toString("base64") });
  return Buffer.concat([Buffer.from(`${MAGIC}${header}\n`), body]);
}

export function decrypt(privateKeyPem, sealed) {
  if (sealed.subarray(0, MAGIC.length).toString() !== MAGIC) throw new Error("Not an APGO backup file.");
  const end = sealed.indexOf(0x0a, MAGIC.length);
  if (end < 0) throw new Error("The backup file is damaged (no header).");
  const { alg, key, iv, tag } = JSON.parse(sealed.subarray(MAGIC.length, end).toString());
  if (alg !== ALG) throw new Error(`Unknown backup format: ${alg}`);
  const aesKey = privateDecrypt({ key: privateKeyPem, ...OAEP }, Buffer.from(key, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", aesKey, Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(MAGIC + JSON.stringify({ alg, key, iv })));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(sealed.subarray(end + 1)), decipher.final()]);
}

function main([command, ...args]) {
  if (command === "keygen" && args.length === 2) {
    const { privateKey, publicKey } = generateKeys();
    writeFileSync(args[0], privateKey, { mode: 0o600, flag: "wx" });
    writeFileSync(args[1], publicKey, { flag: "wx" });
    console.log(`Keys written. Public key fingerprint: ${fingerprint(publicKey)}. Keep ${args[0]} safe; never commit or upload it.`);
  } else if (command === "encrypt" && args.length === 3) {
    const publicKey = readFileSync(args[0], "utf8");
    writeFileSync(args[2], encrypt(publicKey, readFileSync(args[1])));
    console.log(`Encrypted for key ${fingerprint(publicKey)}.`);
  } else if (command === "decrypt" && args.length === 3) {
    writeFileSync(args[2], decrypt(readFileSync(args[0], "utf8"), readFileSync(args[1])), { flag: "wx" });
    console.log("Decrypted.");
  } else {
    console.error("Usage: keygen <private.pem> <public.pem> | encrypt <public.pem> <in> <out> | decrypt <private.pem> <in> <out>");
    process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main(process.argv.slice(2));
