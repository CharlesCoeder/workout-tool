const HID_KEY = 'dc:hid';

export function randomId(len = 20): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/** Short, unambiguous pairing code. */
export function pairingCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function getStoredHid(): string | null {
  try {
    return localStorage.getItem(HID_KEY);
  } catch {
    return null;
  }
}

export function setStoredHid(hid: string | null) {
  try {
    if (hid) localStorage.setItem(HID_KEY, hid);
    else localStorage.removeItem(HID_KEY);
  } catch {
    /* ignore */
  }
}
