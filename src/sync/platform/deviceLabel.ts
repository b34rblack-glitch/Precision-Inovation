import Constants from 'expo-constants';
import { Platform } from 'react-native';

// A human-readable name for this device, shown in the sync device list on
// every other device the user owns ("last synced from Pixel 8, 20 min ago").
//
// Best-effort: expo-constants only sometimes carries a real device name, and
// the user can rename the device from Settings, which is what actually matters.

export function defaultDeviceName(): string {
  const fromConstants = (Constants as { deviceName?: string | null }).deviceName;
  if (typeof fromConstants === 'string' && fromConstants.trim().length > 0) {
    return fromConstants.trim();
  }
  return Platform.select({
    android: 'Android phone',
    ios: 'iPhone',
    default: 'This device',
  });
}

export function platformTag(): string {
  return Platform.OS;
}
