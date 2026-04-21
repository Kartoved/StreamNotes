import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import { generateMnemonic, validateMnemonic, mnemonicToSeed, deriveKeys, deriveFeedKey, generateRandomFeedKey, encrypt as rawEncrypt, decrypt as rawDecrypt } from './index';
import { makeFeedCipher } from './feedCipher';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import type { DerivedKeys } from './keys';
import SeedSetup from '../components/SeedSetup';
import { clearNotesCache } from '../db/notesCache';
import UnlockScreen from '../components/UnlockScreen';
import SeedRecover from '../components/SeedRecover';
import {
  isBiometricEnrolled,
  registerBiometric,
  unlockWithBiometric,
  clearBiometric,
} from './biometric';

interface CryptoContextValue {
  /** Encrypt with the master content key (for personal/legacy data) */
  encrypt: (plaintext: string) => string;
  /** Decrypt with the master content key */
  decrypt: (ciphertext: string) => string;
  /** Encrypt with a specific feed's FEK */
  encryptForFeed: (plaintext: string, feedId: string) => string;
  /** Decrypt with a specific feed's FEK (falls back to master key) */
  decryptForFeed: (ciphertext: string, feedId: string) => string;
  /** Register a feed's encryption key (called when feeds are loaded) */
  registerFeedKey: (feedId: string, fekHex: string) => void;
  /** Mark a feed as shared even before its FEK is loaded. Prevents silent master-key writes. */
  markFeedShared: (feedId: string) => void;
  /** Derive a new FEK for a given key index and return it as hex */
  deriveNewFeedKey: (keyIndex: number) => string;
  /** Generate a random FEK (for imported shared feeds) and return as hex */
  generateFeedKey: () => string;
  /** Encrypt a FEK with the master key for safe DB storage */
  encryptFeedKey: (fekHex: string) => string;
  /** Decrypt a stored FEK from the DB */
  decryptFeedKey: (encryptedFek: string) => string;
  nostrPubKey: string;
  nostrPrivKey: Uint8Array;
  /** Log out and clear keys from memory/storage */
  logout: () => void;
  /** Enable biometric unlock for this device (registers fingerprint/Face ID) */
  enableBiometric: () => Promise<void>;
  /** Disable biometric unlock and remove stored credential */
  disableBiometric: () => Promise<void>;
  /** Whether a biometric credential is currently enrolled on this device */
  biometricEnrolled: boolean;
  nickname: string;
  setNickname: (name: string) => void;
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
  const [nickname, setNicknameState] = useState(() => localStorage.getItem('sn_nickname') || 'you');
  const [biometricEnrolled, setBiometricEnrolled] = useState(() => isBiometricEnrolled());

  const setNickname = useCallback((name: string) => {
    const cleanName = name.trim() || 'you';
    setNicknameState(cleanName);
    localStorage.setItem('sn_nickname', cleanName);
  }, []);

  // In-memory cache: feedId -> FEK (Uint8Array)
  const feedKeysRef = useRef<Map<string, Uint8Array>>(new Map());
  // Set of feed ids known to be shared. Populated by useFeeds before attempting
  // FEK decryption, so we never silently write master-key data to a shared feed
  // whose key happens to be unavailable right now.
  const sharedFeedIdsRef = useRef<Set<string>>(new Set());
  // Keep mnemonic in memory while unlocked so biometric can be enabled without re-entering password
  const mnemonicRef = useRef<string | null>(null);

  const initializeKeys = useCallback((mnemonic: string) => {
    mnemonicRef.current = mnemonic;
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

  const handleBiometricUnlock = useCallback(async (): Promise<boolean> => {
    const mnemonic = await unlockWithBiometric();
    if (!mnemonic) return false;
    initializeKeys(mnemonic);
    return true;
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
          onBiometricUnlock={handleBiometricUnlock}
          onRecover={() => setScreen('recover')}
        />
      );
    }
  }

  if (screen === 'recover') {
    return <SeedRecover onComplete={handleRecover} onBack={() => setScreen(localStorage.getItem('sn_initialized') === '1' ? 'unlock' : 'setup')} />;
  }

  if (screen === 'ready' && keys) {
    const feedCipher = makeFeedCipher({
      masterKey: keys.contentKey,
      getFek: (id) => feedKeysRef.current.get(id) ?? null,
      isShared: (id) => sharedFeedIdsRef.current.has(id),
    });

    const value: CryptoContextValue = {
      encrypt: (plaintext: string) => rawEncrypt(plaintext, keys.contentKey),
      decrypt: (ciphertext: string) => rawDecrypt(ciphertext, keys.contentKey),

      encryptForFeed: feedCipher.encryptForFeed,
      decryptForFeed: feedCipher.decryptForFeed,

      registerFeedKey: (feedId: string, fekHex: string) => {
        feedKeysRef.current.set(feedId, hexToBytes(fekHex));
        sharedFeedIdsRef.current.add(feedId);
      },

      markFeedShared: (feedId: string) => {
        sharedFeedIdsRef.current.add(feedId);
      },

      deriveNewFeedKey: (keyIndex: number) => {
        const fek = deriveFeedKey(keys.masterHD, keyIndex);
        return bytesToHex(fek);
      },

      generateFeedKey: () => {
        const fek = generateRandomFeedKey();
        return bytesToHex(fek);
      },

      encryptFeedKey: (fekHex: string) => {
        return rawEncrypt(fekHex, keys.contentKey);
      },

      decryptFeedKey: (encryptedFek: string) => {
        return rawDecrypt(encryptedFek, keys.contentKey);
      },

      nostrPubKey: keys.nostrPubKey,
      nostrPrivKey: keys.nostrPrivKey,
      logout: () => {
        if (!confirm('Вы действительно хотите выйти? Это удалит ключи с этого устройства. Убедитесь, что у вас сохранена seed-фраза!')) return;
        localStorage.removeItem('sn_seed_plain');
        localStorage.removeItem('sn_seed_encrypted');
        localStorage.removeItem('sn_has_password');
        localStorage.removeItem('sn_initialized');
        localStorage.removeItem('sn_npub');
        // We don't delete the database (OPFS) by default to avoid accidental data loss,
        // but without the keys, the data is unreadable.
        clearBiometric().catch(() => {});
        mnemonicRef.current = null;
        setKeys(null);
        setBiometricEnrolled(false);
        setScreen('setup');
        feedKeysRef.current.clear();
        clearNotesCache();
      },
      enableBiometric: async () => {
        if (!mnemonicRef.current) throw new Error('Session expired');
        await registerBiometric(mnemonicRef.current);
        setBiometricEnrolled(true);
      },
      disableBiometric: async () => {
        await clearBiometric();
        setBiometricEnrolled(false);
      },
      biometricEnrolled,
      nickname,
      setNickname,
    };
    return (
      <CryptoContext.Provider value={value}>
        {children}
      </CryptoContext.Provider>
    );
  }

  return null;
}
