import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { generateMnemonic, validateMnemonic, mnemonicToSeed, deriveKeys, encrypt as rawEncrypt, decrypt as rawDecrypt } from './index';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { randomBytes } from '@noble/ciphers/webcrypto';
import type { DerivedKeys } from './keys';
import SeedSetup from '../components/SeedSetup';
import UnlockScreen from '../components/UnlockScreen';
import SeedRecover from '../components/SeedRecover';

interface CryptoContextValue {
  encrypt: (plaintext: string) => string;
  decrypt: (ciphertext: string) => string;
  nostrPubKey: string;
  nostrPrivKey: Uint8Array;
}

const CryptoContext = createContext<CryptoContextValue | null>(null);

export function useCrypto(): CryptoContextValue {
  const ctx = useContext(CryptoContext);
  if (!ctx) throw new Error('useCrypto must be used within CryptoProvider');
  return ctx;
}

function encryptSeedWithPassword(seed: string, password: string): string {
  const salt = randomBytes(16);
  const key = pbkdf2(sha256, new TextEncoder().encode(password), salt, { c: 100_000, dkLen: 32 });
  const nonce = randomBytes(24);
  const cipher = xchacha20poly1305(key, nonce);
  const ct = cipher.encrypt(new TextEncoder().encode(seed));
  const combined = new Uint8Array(16 + 24 + ct.length);
  combined.set(salt, 0);
  combined.set(nonce, 16);
  combined.set(ct, 40);
  let binary = '';
  for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i]);
  return btoa(binary);
}

export function decryptSeedWithPassword(encoded: string, password: string): string | null {
  try {
    const binary = atob(encoded);
    const raw = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) raw[i] = binary.charCodeAt(i);
    const salt = raw.slice(0, 16);
    const nonce = raw.slice(16, 40);
    const ct = raw.slice(40);
    const key = pbkdf2(sha256, new TextEncoder().encode(password), salt, { c: 100_000, dkLen: 32 });
    const cipher = xchacha20poly1305(key, nonce);
    const plaintext = cipher.decrypt(ct);
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

type Screen = 'loading' | 'setup' | 'unlock' | 'recover' | 'ready';

export function CryptoProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>(() => {
    if (localStorage.getItem('sn_initialized') === '1') return 'unlock';
    return 'setup';
  });
  const [keys, setKeys] = useState<DerivedKeys | null>(null);

  const initializeKeys = useCallback((mnemonic: string) => {
    const seed = mnemonicToSeed(mnemonic);
    const derived = deriveKeys(seed);
    setKeys(derived);
    localStorage.setItem('sn_npub', derived.nostrPubKey);
    localStorage.setItem('sn_initialized', '1');
    setScreen('ready');
  }, []);

  const handleSetupComplete = useCallback((mnemonic: string, password: string | null) => {
    if (password) {
      localStorage.setItem('sn_seed_encrypted', encryptSeedWithPassword(mnemonic, password));
      localStorage.setItem('sn_has_password', '1');
    } else {
      localStorage.setItem('sn_seed_plain', mnemonic);
      localStorage.removeItem('sn_has_password');
    }
    initializeKeys(mnemonic);
  }, [initializeKeys]);

  const handleUnlock = useCallback((password: string) => {
    const hasPassword = localStorage.getItem('sn_has_password') === '1';
    if (hasPassword) {
      const encrypted = localStorage.getItem('sn_seed_encrypted');
      if (!encrypted) return false;
      const mnemonic = decryptSeedWithPassword(encrypted, password);
      if (!mnemonic) return false;
      initializeKeys(mnemonic);
      return true;
    }
    return false;
  }, [initializeKeys]);

  const handleAutoUnlock = useCallback(() => {
    const plain = localStorage.getItem('sn_seed_plain');
    if (plain && validateMnemonic(plain)) {
      initializeKeys(plain);
      return true;
    }
    return false;
  }, [initializeKeys]);

  const handleRecover = useCallback((mnemonic: string, password: string | null) => {
    if (password) {
      localStorage.setItem('sn_seed_encrypted', encryptSeedWithPassword(mnemonic, password));
      localStorage.setItem('sn_has_password', '1');
      localStorage.removeItem('sn_seed_plain');
    } else {
      localStorage.setItem('sn_seed_plain', mnemonic);
      localStorage.removeItem('sn_has_password');
      localStorage.removeItem('sn_seed_encrypted');
    }
    initializeKeys(mnemonic);
  }, [initializeKeys]);

  if (screen === 'setup') {
    return <SeedSetup onComplete={handleSetupComplete} onRecover={() => setScreen('recover')} />;
  }

  if (screen === 'unlock') {
    const hasPassword = localStorage.getItem('sn_has_password') === '1';
    if (!hasPassword) {
      if (handleAutoUnlock()) {
        // will transition to 'ready'
      }
    }
    if (screen === 'unlock') {
      return (
        <UnlockScreen
          onUnlock={handleUnlock}
          onRecover={() => setScreen('recover')}
        />
      );
    }
  }

  if (screen === 'recover') {
    return <SeedRecover onComplete={handleRecover} onBack={() => setScreen(localStorage.getItem('sn_initialized') === '1' ? 'unlock' : 'setup')} />;
  }

  if (screen === 'ready' && keys) {
    const value: CryptoContextValue = {
      encrypt: (plaintext: string) => rawEncrypt(plaintext, keys.contentKey),
      decrypt: (ciphertext: string) => rawDecrypt(ciphertext, keys.contentKey),
      nostrPubKey: keys.nostrPubKey,
      nostrPrivKey: keys.nostrPrivKey,
    };
    return (
      <CryptoContext.Provider value={value}>
        {children}
      </CryptoContext.Provider>
    );
  }

  return null;
}
