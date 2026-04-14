import html2canvas from "html2canvas";

/**
 * SnapshotPlugin
 *
 * Captures a full-page screenshot via html2canvas and POSTs it to the backend
 * snapshot endpoint once every 5 minutes per page (configurable).
 *
 * Timestamps are persisted in localStorage so the throttle survives
 * page reloads.
 */

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const STORAGE_KEY = "__ut_snap_ts__";

export class SnapshotPlugin {
  private lastSentPerPath: Record<string, number> = {};
  private readonly snapshotUrl: string;
  private readonly appId?: string;
  private readonly secretKey?: string;
  private readonly intervalMs: number;

  constructor(cfg: {
    /** Base events endpoint, e.g. "https://api.example.com/api/events" */
    endpoint: string;
    appId?: string;
    secretKey?: string;
    /**
     * Minimum milliseconds between screenshots for the same path.
     * Defaults to 300 000 (5 minutes).
     */
    intervalMs?: number;
  }) {
    // Derive the snapshot endpoint from the events endpoint.
    this.snapshotUrl = cfg.endpoint.replace(/\/events$/, "/snapshots");
    this.appId = cfg.appId;
    this.secretKey = cfg.secretKey;
    this.intervalMs = cfg.intervalMs ?? DEFAULT_INTERVAL_MS;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored)
        this.lastSentPerPath = JSON.parse(stored) as Record<string, number>;
    } catch {
      // localStorage may be unavailable in some contexts — proceed without it.
    }
  }

  /**
   * Capture and send a screenshot for the given path.
   * No-ops if a screenshot was already sent within the last 5 minutes.
   */
  async capture(path: string): Promise<void> {
    if (typeof window === "undefined") return;

    const last = this.lastSentPerPath[path] ?? 0;
    if (Date.now() - last < this.intervalMs) return;

    try {
      // Capture the <html> element so backgrounds set on :root / html are included.
      const root = document.documentElement;

      // Use the page's own background colour so sections that use
      // `background: transparent` don't fall back to white.
      const pageBg =
        getComputedStyle(root).backgroundColor ||
        getComputedStyle(document.body).backgroundColor ||
        "#ffffff";

      const canvas = await html2canvas(root, {
        allowTaint: true,
        useCORS: true,
        logging: false,
        // Full device-pixel-ratio so retina screens stay sharp.
        scale: window.devicePixelRatio || 1,
        // Full page dimensions.
        width: root.scrollWidth,
        height: root.scrollHeight,
        // Use real viewport dimensions so CSS units like dvh/vh are resolved
        // correctly. Setting these to scrollHeight would make 100dvh sections
        // expand to the full page height in the capture.
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        // Capture from the very top-left regardless of current scroll position.
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        // Provide the resolved background colour so transparent areas are filled correctly.
        backgroundColor: pageBg,
        // foreignObjectRendering causes artifacts in many frameworks — keep off.
        foreignObjectRendering: false,
        // Remove the temporary off-screen clone after rendering.
        removeContainer: true,
      });

      // Use a Promise wrapper because toBlob is callback-based.
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) return;

      const form = new FormData();
      form.append("screenshot", blob, "screenshot.png");
      form.append("path", path);
      // Report the logical CSS-pixel dimensions (not DPR-scaled canvas size)
      // so heatmap xPct/yPct coordinates remain accurate.
      form.append("width", String(root.scrollWidth));
      form.append("height", String(root.scrollHeight));
      if (this.appId) form.append("appId", this.appId);

      const headers: Record<string, string> = {};
      if (this.secretKey) headers.Authorization = `Bearer ${this.secretKey}`;

      await fetch(this.snapshotUrl, { method: "POST", headers, body: form });

      // Persist timestamp so throttle survives page reloads.
      this.lastSentPerPath[path] = Date.now();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.lastSentPerPath));
      } catch {
        // quota exceeded — non-fatal
      }
    } catch {
      // Never propagate — snapshot failures must not affect the tracked site.
    }
  }

  destroy(): void {
    // Nothing to clean up — no timers or listeners.
  }
}
