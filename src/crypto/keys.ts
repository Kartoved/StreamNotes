import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { HDKey } from '@scure/bip32';
import { bytesToHex } from '@noble/hashes/utils';
import { schnorr } from '@noble/curves/secp256k1';
import { randomBytes } from '@noble/ciphers/webcrypto';

const SALT = new TextEncoder().encode('streamnotes');

export interface DerivedKeys {
  contentKey: Uint8Array;
  exportKey: Uint8Array;
  nostrPrivKey: Uint8Array;
  nostrPubKey: string;
  masterHD: HDKey;
}

export function deriveKeys(seed: Uint8Array): DerivedKeys {
  const contentKey = hkdf(sha256, seed, SALT, 'content-encryption', 32);
  const exportKey = hkdf(sha256, seed, SALT, 'export-encryption', 32);

  // NIP-06: BIP32 derivation path m/44'/1237'/0'/0/0
  const master = HDKey.fromMasterSeed(seed);
  const nostrHD = master.derive("m/44'/1237'/0'/0/0");
  const nostrPrivKey = nostrHD.privateKey!;
  const nostrPubKey = bytesToHex(schnorr.getPublicKey(nostrPrivKey));

  return { contentKey, exportKey, nostrPrivKey, nostrPubKey, masterHD: master };
}

/**
 * Derive a deterministic Feed Encryption Key (FEK) from the master seed.
 * Path: m/44'/1237'/<keyIndex>'/1/0
 * Used for feeds created locally — the key can be reproduced from the seed.
 */
export function deriveFeedKey(masterHD: HDKey, keyIndex: number): Uint8Array {
  const feedHD = masterHD.derive(`m/44'/1237'/${keyIndex}'/1/0`);
  return hkdf(sha256, feedHD.privateKey!, SALT, `feed-encryption-${keyIndex}`, 32);
}

/**
 * Generate a random FEK for imported/shared feeds where we don't control the derivation.
 */
export function generateRandomFeedKey(): Uint8Array {
  return randomBytes(32);
}
