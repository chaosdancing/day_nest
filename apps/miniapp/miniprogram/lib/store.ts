export type Subscriber<S> = (state: S) => void;

export interface Store<S> {
  getState(): S;
  setState(patch: Partial<S> | ((state: S) => Partial<S>)): void;
  subscribe(sub: Subscriber<S>): () => void;
}

function shallowEqual<S>(a: S, b: S): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) {
      return false;
    }
  }
  return true;
}

export function createStore<S extends object>(initial: S): Store<S> {
  let state = initial;
  const subs = new Set<Subscriber<S>>();
  return {
    getState: () => state,
    setState(patch) {
      const partial = typeof patch === 'function' ? patch(state) : patch;
      const next = { ...state, ...partial };
      if (shallowEqual(state, next)) return;
      state = next;
      for (const sub of subs) {
        try {
          sub(state);
        } catch (e) {
          console.error('[store] subscriber threw:', e);
        }
      }
    },
    subscribe(sub) {
      subs.add(sub);
      return () => subs.delete(sub);
    },
  };
}
