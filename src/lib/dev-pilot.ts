import AsyncStorage from '@react-native-async-storage/async-storage';

import { storageKeys } from './storage-keys';

export async function isPilotOffline(): Promise<boolean> {
  if (!__DEV__) return false;
  return (await AsyncStorage.getItem(storageKeys.pilotOffline)) === 'true';
}

export async function setPilotOffline(value: boolean): Promise<void> {
  if (!__DEV__) return;
  await AsyncStorage.setItem(storageKeys.pilotOffline, value ? 'true' : 'false');
}

export async function setPendingPilotGroup(groupId: string): Promise<void> {
  if (!__DEV__) return;
  await AsyncStorage.setItem(storageKeys.pendingPilotGroup, groupId);
}

export async function consumePendingPilotGroup(): Promise<string | null> {
  if (!__DEV__) return null;
  const groupId = await AsyncStorage.getItem(storageKeys.pendingPilotGroup);
  if (groupId) await AsyncStorage.removeItem(storageKeys.pendingPilotGroup);
  return groupId;
}

export async function throwIfPilotOffline(): Promise<void> {
  if (await isPilotOffline()) {
    throw new Error('network unavailable (pilot simulation)');
  }
}
