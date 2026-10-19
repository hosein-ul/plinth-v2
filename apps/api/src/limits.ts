/**
 * Small in-memory sliding-window counter for FAILED attempts (wrong password, bad credential). It lives in this process only, like
 * the request rate limiter; put a shared store or a gateway in front when running more than one API replica.
 */
export class FailureLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(private readonly max: number, private readonly windowMs: number, private readonly maxKeys = 50_000) {}

  private live(key: string, now: number): number[] {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  /** Seconds the caller must wait before trying again, or 0 when it may proceed. */
  retryAfter(key: string, now = Date.now()): number {
    const list = this.live(key, now);
    if (list.length < this.max) return 0;
    return Math.max(1, Math.ceil((list[0]! + this.windowMs - now) / 1000));
  }

  fail(key: string, now = Date.now()): void {
    if (this.hits.size >= this.maxKeys) this.hits.delete(this.hits.keys().next().value as string);
    const list = this.live(key, now);
    list.push(now);
    this.hits.set(key, list);
  }

  clear(key: string): void {
    this.hits.delete(key);
  }
}
