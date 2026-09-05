import type { Backend } from '../backend';
import { pairingCode } from './household';

export interface PairingDoc {
  tvHid: string;
  phoneHid?: string;
  createdAt: number;
}

/** TV side: publish a code and wait for a phone to answer with the household to use. */
export function hostPairing(backend: Backend, tvHid: string, onPaired: (hid: string) => void): { code: string; stop: () => void } {
  const code = pairingCode();
  const path = `pairings/${code}`;
  void backend.set(path, { tvHid, createdAt: backend.now() } satisfies PairingDoc);
  const unsub = backend.subscribe<PairingDoc>(path, (doc) => {
    if (doc?.phoneHid) {
      onPaired(doc.phoneHid);
      void backend.remove(path);
    }
  });
  return {
    code,
    stop: () => {
      unsub();
      void backend.remove(path);
    },
  };
}

/** Phone side: answer a code. Returns the household id both devices will use. */
export async function joinPairing(backend: Backend, code: string, myHid: string | null): Promise<string> {
  const path = `pairings/${code.toUpperCase().trim()}`;
  const doc = await backend.get<PairingDoc>(path);
  if (!doc?.tvHid) throw new Error('That code is not on a TV right now. Check the TV screen and try again.');
  const hid = myHid ?? doc.tvHid;
  await backend.update(path, { phoneHid: hid });
  return hid;
}
