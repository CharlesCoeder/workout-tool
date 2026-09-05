import type { Backend } from './types';
import { clean } from './types';

const KEY = 'dc:db';
const CHANNEL = 'dc:db';

type Tree = Record<string, unknown>;

function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function getAt(tree: unknown, parts: string[]): unknown {
  let cur: unknown = tree;
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object') return null;
    cur = (cur as Tree)[p];
    if (cur === undefined) return null;
  }
  return cur ?? null;
}

function setAt(tree: Tree, parts: string[], value: unknown): Tree {
  if (parts.length === 0) return (value ?? {}) as Tree;
  const [head, ...rest] = parts;
  const next = { ...tree };
  if (rest.length === 0) {
    if (value === null || value === undefined) delete next[head];
    else next[head] = value;
    return next;
  }
  const child = (typeof next[head] === 'object' && next[head] !== null ? next[head] : {}) as Tree;
  const updated = setAt(child, rest, value);
  if (Object.keys(updated).length === 0) delete next[head];
  else next[head] = updated;
  return next;
}

function overlaps(a: string[], b: string[]): boolean {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Same-browser backend: one JSON tree in localStorage, change fan-out over
 * BroadcastChannel so the TV tab and the remote tab stay in sync.
 */
export class LocalBackend implements Backend {
  readonly mode = 'local' as const;
  private subs = new Set<{ parts: string[]; cb: (v: unknown) => void }>();
  private channel: BroadcastChannel | null = null;

  constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = (ev) => this.notify(splitPath(String(ev.data?.path ?? '')));
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (ev) => {
        if (ev.key === KEY) this.notify([]);
      });
    }
  }

  async ready() {}

  now() {
    return Date.now();
  }

  private read(): Tree {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Tree) : {};
    } catch {
      return {};
    }
  }

  private write(tree: Tree, path: string) {
    localStorage.setItem(KEY, JSON.stringify(tree));
    this.notify(splitPath(path));
    this.channel?.postMessage({ path });
  }

  private notify(parts: string[]) {
    const tree = this.read();
    for (const s of this.subs) if (overlaps(parts, s.parts)) s.cb(getAt(tree, s.parts));
  }

  async get<T>(path: string): Promise<T | null> {
    return getAt(this.read(), splitPath(path)) as T | null;
  }

  async set(path: string, value: unknown) {
    this.write(setAt(this.read(), splitPath(path), clean(value)), path);
  }

  async update(path: string, patch: Record<string, unknown>) {
    let tree = this.read();
    const base = splitPath(path);
    for (const [k, v] of Object.entries(patch)) tree = setAt(tree, [...base, ...splitPath(k)], clean(v));
    this.write(tree, path);
  }

  async remove(path: string) {
    this.write(setAt(this.read(), splitPath(path), null), path);
  }

  subscribe<T>(path: string, cb: (value: T | null) => void): () => void {
    const entry = { parts: splitPath(path), cb: cb as (v: unknown) => void };
    this.subs.add(entry);
    queueMicrotask(() => cb(getAt(this.read(), entry.parts) as T | null));
    return () => {
      this.subs.delete(entry);
    };
  }
}
