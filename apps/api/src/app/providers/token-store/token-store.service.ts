import { Injectable, OnModuleDestroy } from "@nestjs/common";

@Injectable()
export class TokenStoreService implements OnModuleDestroy {
  private readonly stores = new Map<string, Map<string, string>>();
  private readonly timers = new Map<string, NodeJS.Timeout>();

  private getStore(namespace: string): Map<string, string> {
    if (!this.stores.has(namespace)) {
      this.stores.set(namespace, new Map());
    }
    return this.stores.get(namespace);
  }

  get(namespace: string, key: string): string | null {
    return this.getStore(namespace).get(key) ?? null;
  }

  set(namespace: string, key: string, value: string): void {
    this.getStore(namespace).set(key, value);
  }

  expire(namespace: string, key: string, seconds: number): void {
    const timerKey = `${namespace}:${key}`;

    if (this.timers.has(timerKey)) {
      clearTimeout(this.timers.get(timerKey));
    }

    this.timers.set(timerKey, setTimeout(() => {
      this.getStore(namespace).delete(key);
      this.timers.delete(timerKey);
    }, seconds * 1000));
  }

  del(namespace: string, key: string): void {
    this.getStore(namespace).delete(key);

    const timerKey = `${namespace}:${key}`;
    if (this.timers.has(timerKey)) {
      clearTimeout(this.timers.get(timerKey));
      this.timers.delete(timerKey);
    }
  }

  onModuleDestroy() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.stores.clear();
  }
}
