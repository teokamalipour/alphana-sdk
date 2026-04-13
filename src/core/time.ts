import type { TrackerEvent } from "../types";

type EmitFn = (event: TrackerEvent) => void;

interface TimePluginOptions {
  emit: EmitFn;
  sessionId: string;
}

/**
 * Tracks the time a user spends on each page.
 *
 * - Starts a timer when the page becomes active (init / tab focus).
 * - Stops and emits a `timespent` event when:
 *     • The user navigates away  (tracker:navigate)
 *     • The tab is hidden        (visibilitychange)
 *     • The page is unloading    (beforeunload / pagehide)
 * - Resumes timing when the tab becomes visible again.
 */
export class TimePlugin {
  private readonly emit: EmitFn;
  private readonly sessionId: string;
  private currentPath = "";
  private startTime = 0;
  private tracking = false;

  constructor({ emit, sessionId }: TimePluginOptions) {
    this.emit = emit;
    this.sessionId = sessionId;
  }

  init(): void {
    this.currentPath = window.location.pathname + window.location.search;
    this.startTracking();

    window.addEventListener("tracker:navigate", this.handleNavigate);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    window.addEventListener("beforeunload", this.handleUnload);
    window.addEventListener("pagehide", this.handleUnload);
  }

  destroy(): void {
    this.stopTracking();
    window.removeEventListener("tracker:navigate", this.handleNavigate);
    document.removeEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );
    window.removeEventListener("beforeunload", this.handleUnload);
    window.removeEventListener("pagehide", this.handleUnload);
  }

  private startTracking(): void {
    this.startTime = Date.now();
    this.tracking = true;
  }

  private stopTracking(): void {
    if (!this.tracking || !this.currentPath) return;
    const duration = Date.now() - this.startTime;
    if (duration < 100) {
      this.tracking = false;
      return; // Ignore sub-100 ms blips (e.g. rapid navigations).
    }
    this.emit({
      type: "timespent",
      data: {
        path: this.currentPath,
        duration,
        sessionId: this.sessionId,
        timestamp: Date.now(),
      },
    });
    this.tracking = false;
  }

  private handleNavigate = (e: CustomEvent<{ path: string }>): void => {
    this.stopTracking();
    this.currentPath = e.detail.path;
    this.startTracking();
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.stopTracking();
    } else {
      this.startTracking();
    }
  };

  private handleUnload = (): void => {
    this.stopTracking();
  };
}
