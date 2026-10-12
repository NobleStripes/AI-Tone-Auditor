import { AsyncLocalStorage } from 'node:async_hooks';

const jobs = new AsyncLocalStorage<ProviderWork>();

export class ProviderWork {
  private pending = new Set<Promise<unknown>>();

  run<T>(operation: () => Promise<T>): Promise<T> {
    return jobs.run(this, operation);
  }

  track<T>(operation: Promise<T>): Promise<T> {
    this.pending.add(operation);
    void operation.then(() => this.pending.delete(operation), () => this.pending.delete(operation));
    return operation;
  }

  async settled(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }
}

export function trackProviderWork<T>(operation: Promise<T>): Promise<T> {
  return jobs.getStore()?.track(operation) ?? operation;
}
