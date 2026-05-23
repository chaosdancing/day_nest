export interface DebouncedFn<Args extends unknown[]> {
  run(...args: Args): void;
  cancel(): void;
  flush(): void;
}

export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
): DebouncedFn<Args> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Args | null = null;

  return {
    run(...args: Args) {
      pendingArgs = args;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        if (pendingArgs) fn(...pendingArgs);
        timer = null;
        pendingArgs = null;
      }, delayMs);
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pendingArgs = null;
    },
    flush() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (pendingArgs) {
        const args = pendingArgs;
        pendingArgs = null;
        fn(...args);
      }
    },
  };
}
