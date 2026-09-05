import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { get, getDatabase, onValue, ref, remove, set, update, type Database } from 'firebase/database';
import type { Backend } from './types';
import { clean } from './types';

export interface FirebaseEnv {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  appId: string;
}

export function firebaseEnvFromVite(): FirebaseEnv | null {
  const e = import.meta.env;
  if (!e.VITE_FIREBASE_API_KEY || !e.VITE_FIREBASE_DATABASE_URL) return null;
  return {
    apiKey: e.VITE_FIREBASE_API_KEY,
    authDomain: e.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: e.VITE_FIREBASE_DATABASE_URL,
    projectId: e.VITE_FIREBASE_PROJECT_ID,
    appId: e.VITE_FIREBASE_APP_ID,
  };
}

export class FirebaseBackend implements Backend {
  readonly mode = 'firebase' as const;
  private db: Database;
  private offset = 0;
  private readyPromise: Promise<void>;

  constructor(env: FirebaseEnv) {
    const app = initializeApp(env);
    this.db = getDatabase(app);
    const auth = getAuth(app);
    this.readyPromise = new Promise<void>((resolve, reject) => {
      onAuthStateChanged(auth, (user) => {
        if (user) resolve();
        else signInAnonymously(auth).catch(reject);
      });
    });
    onValue(ref(this.db, '.info/serverTimeOffset'), (snap) => {
      this.offset = Number(snap.val() ?? 0);
    });
  }

  ready() {
    return this.readyPromise;
  }

  now() {
    return Date.now() + this.offset;
  }

  async get<T>(path: string): Promise<T | null> {
    await this.readyPromise;
    const snap = await get(ref(this.db, path));
    return (snap.val() ?? null) as T | null;
  }

  async set(path: string, value: unknown) {
    await this.readyPromise;
    await set(ref(this.db, path), clean(value) ?? null);
  }

  async update(path: string, patch: Record<string, unknown>) {
    await this.readyPromise;
    await update(ref(this.db, path), clean(patch));
  }

  async remove(path: string) {
    await this.readyPromise;
    await remove(ref(this.db, path));
  }

  subscribe<T>(path: string, cb: (value: T | null) => void): () => void {
    let unsub: (() => void) | null = null;
    let cancelled = false;
    this.readyPromise.then(() => {
      if (cancelled) return;
      unsub = onValue(ref(this.db, path), (snap) => cb((snap.val() ?? null) as T | null), () => cb(null));
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }
}
