import { describe, it, expect } from 'vitest';
import { createUploadQueue } from '../../miniprogram/lib/uploadQueue.js';

const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms));

describe('createUploadQueue', () => {
  it('runs at most N tasks concurrently', async () => {
    const q = createUploadQueue({ concurrency: 2 });
    let peak = 0;
    let current = 0;
    const task = async () => {
      current++;
      peak = Math.max(peak, current);
      await tick(20);
      current--;
      return 'ok';
    };
    await Promise.all([
      q.enqueue(task),
      q.enqueue(task),
      q.enqueue(task),
      q.enqueue(task),
      q.enqueue(task),
    ]);
    expect(peak).toBe(2);
  });

  it("returns each task's resolved value", async () => {
    const q = createUploadQueue({ concurrency: 3 });
    const values = await Promise.all(
      [1, 2, 3, 4].map((n) => q.enqueue(async () => n * 10)),
    );
    expect(values).toEqual([10, 20, 30, 40]);
  });

  it('rejects per-task without halting the queue', async () => {
    const q = createUploadQueue({ concurrency: 2 });
    const results = await Promise.allSettled([
      q.enqueue(async () => {
        throw new Error('boom');
      }),
      q.enqueue(async () => 'ok'),
      q.enqueue(async () => 'ok2'),
    ]);
    expect(results[0]!.status).toBe('rejected');
    expect(results[1]!.status).toBe('fulfilled');
    expect(results[2]!.status).toBe('fulfilled');
  });

  it('reports in-flight and pending counts during execution', async () => {
    const q = createUploadQueue({ concurrency: 2 });
    let release: (() => void) | null = null;
    const blocker = new Promise<void>((r) => {
      release = r;
    });
    const blocked = () => blocker.then(() => 'done');
    const p1 = q.enqueue(blocked);
    const p2 = q.enqueue(blocked);
    const p3 = q.enqueue(blocked);
    await tick();
    expect(q.inFlight()).toBe(2);
    expect(q.pending()).toBe(1);
    release!();
    await Promise.all([p1, p2, p3]);
    expect(q.inFlight()).toBe(0);
    expect(q.pending()).toBe(0);
  });
});
