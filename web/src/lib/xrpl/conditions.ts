import crypto from "node:crypto";

// PREIMAGE-SHA-256 crypto-conditions (RFC draft-thomas-crypto-conditions),
// DER-encoded as XRPL expects, for a 32-byte preimage.
//   fulfillment = A0 22 80 20 <preimage>
//   condition   = A0 25 80 20 <sha256(preimage)> 81 01 20   (cost = 32)

export function newPreimage(): string {
  return crypto.randomBytes(32).toString("hex").toUpperCase();
}

export function fulfillmentFor(preimageHex: string): string {
  return ("A0228020" + preimageHex).toUpperCase();
}

export function conditionFor(preimageHex: string): string {
  const hash = crypto.createHash("sha256").update(Buffer.from(preimageHex, "hex")).digest("hex");
  return ("A0258020" + hash + "810120").toUpperCase();
}

// Simulated oracle sources: each has its own Ed25519 key and signs its attestation.
const g = globalThis as unknown as { __oracleKeys?: Record<string, crypto.KeyObject> };

export function signAttestation(source: string, payload: string) {
  g.__oracleKeys ??= {};
  if (!g.__oracleKeys[source]) g.__oracleKeys[source] = crypto.generateKeyPairSync("ed25519").privateKey;
  const priv = g.__oracleKeys[source];
  const pub = crypto.createPublicKey(priv).export({ type: "spki", format: "der" }).toString("hex").slice(-64);
  const signature = crypto.sign(null, Buffer.from(payload), priv).toString("hex");
  return { signature, publicKey: pub };
}
