import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import type { GlucoseUnit, NightscoutAuth } from './core';

/** Connection + review settings the user enters, persisted between sessions. */
export interface AppConfig {
  url: string;
  /** Nightscout access token (preferred). */
  token: string;
  /** Raw API secret (hashed locally before sending). */
  secret: string;
  days: number;
  unit: GlucoseUnit;
}

export const DEFAULT_CONFIG: AppConfig = {
  url: '',
  token: '',
  secret: '',
  days: 14,
  unit: 'mg/dl',
};

const STORE_KEY = 'aid-advisor-config-v1';

/** Credentials are sensitive, so the whole config blob goes in SecureStore. */
export async function loadConfig(): Promise<AppConfig> {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<AppConfig>) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(config));
  } catch {
    // Non-fatal: persistence is a convenience, not required to run a review.
  }
}

/**
 * Build the auth the core client expects. A token is passed through; a raw
 * secret is hashed to SHA-1 on-device (Nightscout's api-secret scheme) so the
 * plaintext secret never leaves the phone.
 */
export async function buildAuth(config: AppConfig): Promise<NightscoutAuth> {
  if (config.token.trim()) return { token: config.token.trim() };
  if (config.secret.trim()) {
    const apiSecretHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA1,
      config.secret.trim(),
    );
    return { apiSecretHash };
  }
  return {};
}

/** The device's current UTC offset in minutes, used to bucket local time. */
export function deviceTzOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}
