import type { Backend } from './types';
import { LocalBackend } from './local';
import { FirebaseBackend, firebaseEnvFromVite } from './firebase';

let instance: Backend | null = null;

export function getBackend(): Backend {
  if (instance) return instance;
  const env = firebaseEnvFromVite();
  instance = env ? new FirebaseBackend(env) : new LocalBackend();
  return instance;
}

export type { Backend } from './types';
