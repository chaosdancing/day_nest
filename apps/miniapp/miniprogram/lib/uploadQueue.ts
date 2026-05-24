export interface UploadQueueOptions {
  concurrency: number;
}

export interface UploadQueue {
  enqueue<T>(task: () => Promise<T>): Promise<T>;
  inFlight(): number;
  pending(): number;
}

interface Job {
  run: () => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

export function createUploadQueue(opts: UploadQueueOptions): UploadQueue {
  const concurrency = Math.max(1, opts.concurrency);
  let active = 0;
  const waiting: Job[] = [];

  const drain = () => {
    while (active < concurrency && waiting.length > 0) {
      const job = waiting.shift()!;
      active++;
      job.run().then(
        (v) => {
          active--;
          drain();
          job.resolve(v);
        },
        (e) => {
          active--;
          drain();
          job.reject(e);
        },
      );
    }
  };

  return {
    enqueue<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        waiting.push({
          run: task as () => Promise<unknown>,
          resolve: resolve as (v: unknown) => void,
          reject,
        });
        drain();
      });
    },
    inFlight: () => active,
    pending: () => waiting.length,
  };
}
