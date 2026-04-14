// ─── Config ───────────────────────────────────────────────────────────────────

export interface TrackerConfig {
  /**
   * URL to POST events to.
   * Defaults to `https://api.alphana.ir/api/events` — override only if self-hosting.
   */
  endpoint?: string;
  /**
   * App ID obtained from the UserTracker dashboard.
   * Sent in every request body so the backend associates events with the correct app.
   */
  appId?: string;
  /**
   * App secret key obtained from the UserTracker dashboard.
   * Sent as the `Authorization: Bearer` header on every request.
   */
  secretKey?: string;
  /** Provide a custom session ID; auto-generated via crypto.randomUUID if omitted. */
  sessionId?: string;
  /** Track SPA route changes (pushState / replaceState / popstate). Default: true */
  trackNavigation?: boolean;
  /** Track time spent on each page. Default: true */
  trackTime?: boolean;
  /** Collect mouse-move, click, and scroll data for heatmap. Default: true */
  trackHeatmap?: boolean;
  /**
   * Fraction of mousemove / scroll events to record (0–1).
   * 1 = record every event, 0.3 = ~30 % sampled. Default: 0.3
   */
  mouseSampleRate?: number;
  /** Maximum heatmap points stored in memory per page. Default: 2000 */
  maxHeatmapPoints?: number;
  /**
   * Number of events to accumulate before an automatic flush is triggered.
   * Default: 20
   */
  batchSize?: number;
  /**
   * Milliseconds between automatic batch flushes regardless of queue size.
   * Default: 5000 (5 s)
   */
  flushInterval?: number;
  /**
   * Automatically capture console.info/warn/error, window.onerror, and
   * unhandledrejection events and send them to the backend log endpoint.
   * Default: true (when endpoint is provided)
   */
  trackLogs?: boolean;
  /**
   * Automatically capture and send full-page screenshots to the backend
   * every 5 minutes for use in the heatmap view.
   * Requires `html2canvas` to be installed in the host application:
   *   npm install html2canvas
   * Default: true (when endpoint is provided and html2canvas is installed)
   */
  trackSnapshots?: boolean;
  /** Called synchronously for every emitted event. */
  onEvent?: (event: TrackerEvent) => void;
}

// ─── Geolocation ─────────────────────────────────────────────────────────────

export interface GeoLocation {
  /** ISO 3166-1 alpha-2 country code, e.g. "US" */
  country: string;
  /** Human-readable country name, e.g. "United States" */
  countryName: string;
  city?: string;
  region?: string;
  latitude?: number;
  longitude?: number;
}

// ─── Events ───────────────────────────────────────────────────────────────────

export interface PageView {
  path: string;
  title: string;
  timestamp: number;
  sessionId: string;
  referrer?: string;
}

export interface TimeSpent {
  path: string;
  /** Duration in milliseconds */
  duration: number;
  sessionId: string;
  timestamp: number;
}

export interface HeatmapPoint {
  /** X position as a percentage of the full page width (0–100) */
  xPct: number;
  /** Y position as a percentage of the full page height (0–100) */
  yPct: number;
  /** Absolute X pixel in the viewport at the time of the event */
  x: number;
  /** Absolute Y pixel from the top of the page (includes scroll) */
  y: number;
  type: "move" | "click" | "scroll";
  path: string;
  timestamp: number;
}

export type TrackerEvent =
  | { type: "pageview"; data: PageView }
  | { type: "timespent"; data: TimeSpent }
  | { type: "heatmap"; data: HeatmapPoint };

// ─── Session snapshot ─────────────────────────────────────────────────────────

export interface SessionData {
  id: string;
  startedAt: number;
  pageViews: PageView[];
  /** Cumulative milliseconds per path */
  timeSpent: Record<string, number>;
  /** Collected points per path */
  heatmap: Record<string, HeatmapPoint[]>;
  /** Approximate visitor location resolved from IP (filled asynchronously) */
  location?: GeoLocation;
}

// ─── Renderer options ─────────────────────────────────────────────────────────

export interface HeatmapRenderOptions {
  /** Influence radius of each point in pixels. Default: 25 */
  radius?: number;
  /** Maximum opacity of the hottest areas (0–1). Default: 0.85 */
  maxOpacity?: number;
  /** Minimum opacity for the coolest visible areas (0–1). Default: 0 */
  minOpacity?: number;
}

// ─── Global augmentation ──────────────────────────────────────────────────────

declare global {
  interface WindowEventMap {
    "tracker:navigate": CustomEvent<{ path: string; title: string }>;
  }
}
