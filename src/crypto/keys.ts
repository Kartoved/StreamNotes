import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { HDKey } from '@scure/bip32';
import { bytesToHex } from '@noble/hashes/utils';
import { schnorr } from '@noble/curves/secp256k1';

const SALT = new TextEncoder().encode('streamnotes');

export interface DerivedKeys {
  contentKey: Uint8Array;
  exportKey: Uint8Array;
  nostrPrivKey: Uint8Array;
  nostrPubKey: string;
}

export function deriveKeys(seed: Uint8Array): DerivedKeys {
  const contentKey = hkdf(sha256, seed, SALT, 'content-encryption', 32);
  const exportKey = hkdf(sha256, seed, SALT, 'export-encryption', 32);

  // NIP-06: BIP32 derivation path m/44'/1237'/0'/0/0
  const master = HDKey.fromMasterSeed(seed);
  const nostrHD = master.derive("m/44'/1237'/0'/0/0");
  const nostrPrivKey = nostrHD.privateKey!;
  const nostrPubKey = bytesToHex(schnorr.getPublicKey(nostrPrivKey));

  return { contentKey, exportKey, nostrPrivKey, nostrPubKey };
}
