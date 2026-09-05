export interface Backend {
  readonly mode: 'local' | 'firebase';
  /** Resolves once the backend can be used (auth done, clock offset known). */
  ready(): Promise<void>;
  /** Server-aligned wall clock in ms. */
  now(): number;
  get<T>(path: string): Promise<T | null>;
  set(path: string, value: unknown): Promise<void>;
  update(path: string, patch: Record<string, unknown>): Promise<void>;
  remove(path: string): Promise<void>;
  subscribe<T>(path: string, cb: (value: T | null) => void): () => void;
}

/** Drop `undefined` (RTDB rejects it) and keep the value JSON-clean. */
export function clean<T>(v: T): T {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}
