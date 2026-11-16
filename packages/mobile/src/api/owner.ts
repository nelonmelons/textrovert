import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The signed-in user's owner key from POST /account. Every request sends it as x-owner-key, so Ask, People and the
 * rest read this user's chats; without one the hosted API falls back to its demo owner.
 */
const STORAGE_KEY = 'textrovert.ownerKey.v1';
let cached: string | null | undefined;

export async function loadOwnerKey(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    cached = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    cached = null;
  }
  return cached;
}

export async function saveOwnerKey(ownerKey: string) {
  cached = ownerKey;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, ownerKey);
  } catch {
    // Kept in memory for this session either way.
  }
}

export async function clearOwnerKey() {
  cached = null;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}
