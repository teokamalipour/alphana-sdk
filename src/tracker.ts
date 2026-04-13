import type {
  TrackerConfig,
  TrackerEvent,
  SessionData,
  PageView,
  HeatmapPoint,
  GeoLocation,
} from "./types";
import { generateSessionId } from "./utils/session";
import { fetchLocation } from "./utils/geo";
import { NavigationPlugin } from "./core/navigation";
import { TimePlugin } from "./core/time";
import { HeatmapPlugin } from "./core/heatmap";
import { LogCapture } from "./core/logger";

const DEFAULTS = {
  trackNavigation: true,
  trackTime: true,
  trackHeatmap: true,
  trackLogs: true,
  mouseSampleRate: 0.3,
  maxHeatmapPoints: 2000,
  batchSize: 20,
  flushInterval: 5_000,
} as const;

type SubscriberFn = (event: TrackerEvent) => void;

/**
 * Core tracker class. Framework-agnostic — works in any environment that has
 * a browser DOM (React, Next.js Pages Router, Vite, vanilla JS/TS, etc.).
 *
 * Usage:
 * ```ts
 * const tracker = new UserTracker({ endpoint: 'https://my-api.com/events' });
 * tracker.init(); // call once; safe to call in SSR (no-op server-side)
 * ```
 *
 * Destroy when done (e.g. component unmount):
 * ```ts
 * tracker.destroy();
 * ```
 */
type ResolvedConfig = Required<
  Pick<
    TrackerConfig,
    | "trackNavigation"
    | "trackTime"
    | "trackHeatmap"
    | "trackLogs"
    | "mouseSampleRate"
    | "maxHeatmapPoints"
    | "batchSize"
    | "flushInterval"
  >
> &
  TrackerConfig;

export class UserTracker {
  private readonly cfg: ResolvedConfig;
  private session: SessionData;
  private navigation?: NavigationPlugin;
  private time?: TimePlugin;
  private heatmap?: HeatmapPlugin;
  /** Public so consumers can call logCapture.capture() for manual log entries. */
  logCapture?: LogCapture;
  private initialized = false;
  private readonly subscribers = new Set<SubscriberFn>();

  /** In-memory queue of events waiting to be flushed. */
  private queue: TrackerEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private location: GeoLocation | null = null;

  constructor(config: TrackerConfig = {}) {
    this.cfg = { ...DEFAULTS, ...config } as ResolvedConfig;

    // Validate endpoint URL up front so the error is thrown at construction
    // time rather than silently failing during a network request.
    if (this.cfg.endpoint) {
      try {
        new URL(this.cfg.endpoint);
      } catch {
        throw new Error(
          `[user-tracker] Invalid endpoint URL: "${this.cfg.endpoint}"`,
        );
      }
    }

    this.session = {
      id: config.sessionId ?? generateSessionId(),
      startedAt: Date.now(),
      pageViews: [],
      timeSpent: {},
      heatmap: {},
    };
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Attach event listeners and start tracking.
   * Safe to call during SSR — returns `this` immediately if `window` is
   * undefined so it can be chained: `const tracker = new UserTracker(cfg).init()`.
   */
  init(): this {
    if (typeof window === "undefined" || this.initialized) return this;

    const emit = this.emit.bind(this);
    const { id: sessionId } = this.session;

    if (this.cfg.trackNavigation) {
      this.navigation = new NavigationPlugin({ emit, sessionId });
      this.navigation.init();
    }

    if (this.cfg.trackTime) {
      this.time = new TimePlugin({ emit, sessionId });
      this.time.init();
    }

    if (this.cfg.trackHeatmap) {
      this.heatmap = new HeatmapPlugin({
        emit,
        sessionId,
        sampleRate: this.cfg.mouseSampleRate,
        maxPoints: this.cfg.maxHeatmapPoints,
      });
      this.heatmap.init();
    }

    if (this.cfg.endpoint) {
      // Flush on a regular interval — even if the batch threshold isn't hit.
      this.flushTimer = setInterval(() => {
        if (this.queue.length > 0) void this.flush();
      }, this.cfg.flushInterval);

      // Resolve visitor location from IP in the background.
      void fetchLocation().then((loc) => {
        this.location = loc;
        if (loc) this.session.location = loc;
      });

      // Flush remaining queue when the tab is hidden or the page is unloaded.
      window.addEventListener("visibilitychange", this.handleVisibilityChange);
      window.addEventListener("pagehide", this.handlePageHide);

      // Periodic keep-alive heartbeat every 30 s so the backend knows the
      // session is still active and doesn't expire it prematurely.
      this.heartbeatTimer = setInterval(() => {
        if (document.visibilityState !== "hidden") void this.sendHeartbeat();
      }, 30_000);

      // Auto-capture console logs and unhandled errors.
      if (this.cfg.trackLogs) {
        this.logCapture = new LogCapture({
          endpoint: this.cfg.endpoint,
          sessionId: this.session.id,
          secretKey: this.cfg.secretKey,
        });
        this.logCapture.init();
      }
    }

    this.initialized = true;
    return this;
  }

  /** Remove all event listeners, flush remaining queue, and reset state. */
  destroy(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (typeof window !== "undefined") {
      window.removeEventListener(
        "visibilitychange",
        this.handleVisibilityChange,
      );
      window.removeEventListener("pagehide", this.handlePageHide);
    }

    this.navigation?.destroy();
    this.time?.destroy();
    this.heatmap?.destroy();
    this.logCapture?.destroy();

    // Best-effort flush of any remaining queued events.
    if (this.queue.length > 0 && this.cfg.endpoint) {
      this.flushBeacon();
    }

    this.initialized = false;
  }

  private handleVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") {
      if (this.queue.length > 0) this.flushBeacon();
      this.sendDeactivate();
    }
  };

  private handlePageHide = (): void => {
    if (this.queue.length > 0) this.flushBeacon();
    this.sendDeactivate();
  };

  /**
   * Send a keep-alive heartbeat so the backend knows this session is still
   * active. Called every 30 s while the tab is visible.
   */
  private async sendHeartbeat(): Promise<void> {
    if (!this.cfg.endpoint) return;
    const url = `${this.cfg.endpoint}/heartbeat`;
    const authHeaders: Record<string, string> = this.cfg.secretKey
      ? { Authorization: `Bearer ${this.cfg.secretKey}` }
      : {};
    const body = JSON.stringify({
      sessionId: this.session.id,
      path: typeof window !== "undefined" ? window.location.pathname : "/",
      active: true,
      ...(this.location ? { location: this.location } : {}),
    });
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body,
        keepalive: true,
      });
    } catch {
      // Silent — heartbeat failure should never surface to the user.
    }
  }

  /**
   * Send a synchronous beacon to mark this session as inactive.
   * Called on page unload / tab hidden so the dashboard reflects real-time.
   */
  private sendDeactivate(): void {
    if (!this.cfg.endpoint) return;
    const url = `${this.cfg.endpoint}/heartbeat`;
    const authHeaders: Record<string, string> = this.cfg.secretKey
      ? { Authorization: `Bearer ${this.cfg.secretKey}` }
      : {};
    const body = JSON.stringify({
      sessionId: this.session.id,
      path: typeof window !== "undefined" ? window.location.pathname : "/",
      active: false,
    });
    // sendBeacon fires even if the page is being unloaded.
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    } else {
      // Fallback for environments without sendBeacon.
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body,
        keepalive: true,
      }).catch(() => undefined);
    }
  }

  // ─── Event pipeline ─────────────────────────────────────────────────────────

  /** Emit a tracker event. Also used internally by the plugins. */
  emit(event: TrackerEvent): void {
    // 1 – accumulate into session data
    switch (event.type) {
      case "pageview":
        this.session.pageViews.push(event.data);
        break;

      case "timespent": {
        const prev = this.session.timeSpent[event.data.path] ?? 0;
        this.session.timeSpent[event.data.path] = prev + event.data.duration;
        break;
      }

      case "heatmap": {
        const key = event.data.path;
        if (!this.session.heatmap[key]) this.session.heatmap[key] = [];
        const pts = this.session.heatmap[key];
        if (pts.length < this.cfg.maxHeatmapPoints) pts.push(event.data);
        break;
      }
    }

    // 2 – notify subscribers (used internally by React hooks)
    this.subscribers.forEach((fn) => fn(event));

    // 3 – user callback
    this.cfg.onEvent?.(event);

    // 4 – enqueue for batched remote sending
    if (this.cfg.endpoint) {
      this.queue.push(event);
      // Auto-flush once the batch size threshold is reached.
      if (this.queue.length >= this.cfg.batchSize) {
        void this.flush();
      }
    }
  }

  /**
   * Subscribe to every emitted event. Returns an unsubscribe function.
   *
   * ```ts
   * const unsub = tracker.subscribe(event => console.log(event));
   * // later…
   * unsub();
   * ```
   */
  subscribe(fn: SubscriberFn): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  // ─── Manual tracking helpers ────────────────────────────────────────────────

  /**
   * Manually record a page view and dispatch `tracker:navigate`.
   * Required for Next.js App Router — call it inside a `useEffect` that
   * depends on `usePathname()`:
   *
   * ```tsx
   * const pathname = usePathname();
   * useEffect(() => { tracker.trackPageView(pathname); }, [pathname]);
   * ```
   */
  trackPageView(path?: string): void {
    const resolvedPath =
      path ??
      (typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/");

    this.emit({
      type: "pageview",
      data: {
        path: resolvedPath,
        title: typeof document !== "undefined" ? document.title : "",
        timestamp: Date.now(),
        sessionId: this.session.id,
        referrer:
          typeof document !== "undefined"
            ? document.referrer || undefined
            : undefined,
      },
    });

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("tracker:navigate", {
          detail: { path: resolvedPath, title: document.title },
        }),
      );
    }
  }

  // ─── Data accessors ─────────────────────────────────────────────────────────

  /** A read-only snapshot of the current session. */
  getSession(): Readonly<SessionData> {
    return this.session;
  }

  /** All page views recorded so far. */
  getPageViews(): PageView[] {
    return [...this.session.pageViews];
  }

  /** Cumulative milliseconds spent per path. */
  getTimeSpent(): Record<string, number> {
    return { ...this.session.timeSpent };
  }

  /** Heatmap points for a specific path. */
  getHeatmapData(path: string): HeatmapPoint[];
  /** Heatmap points for all tracked paths. */
  getHeatmapData(): Record<string, HeatmapPoint[]>;
  getHeatmapData(
    path?: string,
  ): HeatmapPoint[] | Record<string, HeatmapPoint[]> {
    if (path !== undefined) {
      return [...(this.session.heatmap[path] ?? [])];
    }
    return Object.entries(this.session.heatmap).reduce<
      Record<string, HeatmapPoint[]>
    >((acc, [k, v]) => {
      acc[k] = [...v];
      return acc;
    }, {});
  }

  // ─── Network ────────────────────────────────────────────────────────────────

  /** Drain the queue and POST all pending events to the batch endpoint. */
  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    // Splice atomically so new events emitted during the async request don't
    // get lost — they stay in the queue for the next flush.
    const batch = this.queue.splice(0);
    await this.sendBatch(batch);
  }

  /**
   * Synchronous best-effort flush via `navigator.sendBeacon`.
   * Used on `pagehide` / `visibilitychange:hidden` where async fetch may be
   * cancelled by the browser before it completes.
   */
  private flushBeacon(): void {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0);
    const url = `${this.cfg.endpoint!}/batch`;
    const blob = new Blob([this.buildBatchBody(batch)], {
      type: "application/json",
    });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(url, blob);
    } else {
      // Fallback: fire-and-forget fetch (best effort on platforms without sendBeacon)
      void this.sendBatch(batch);
    }
  }

  private buildBatchBody(events: TrackerEvent[]): string {
    return JSON.stringify({
      location: this.location ?? undefined,
      events: events.map((e) => ({
        sessionId: this.session.id,
        type: e.type,
        data: e.data,
      })),
    });
  }

  private async sendBatch(events: TrackerEvent[]): Promise<void> {
    const url = `${this.cfg.endpoint!}/batch`;
    const authHeaders: Record<string, string> = this.cfg.secretKey
      ? { Authorization: `Bearer ${this.cfg.secretKey}` }
      : {};
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: this.buildBatchBody(events),
        keepalive: true,
      });
    } catch {
      // Intentionally silent — analytics must never surface errors to users.
    }
  }
}
