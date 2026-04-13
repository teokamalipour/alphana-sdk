import type { TrackerEvent } from "../types";

type EmitFn = (event: TrackerEvent) => void;

interface NavigationPluginOptions {
  emit: EmitFn;
  sessionId: string;
}

/**
 * Tracks SPA route changes by monkey-patching history.pushState /
 * history.replaceState and listening to the popstate event.
 *
 * For every navigation it:
 *   1. Emits a `pageview` event.
 *   2. Dispatches the custom DOM event `tracker:navigate` so that other
 *      plugins (TimePlugin, HeatmapPlugin) can react without having to
 *      duplicate the pushState patching.
 *
 * Next.js App Router note:
 *   The App Router manages navigation internally; use `usePageView(pathname)`
 *   from `user-tracker/react` together with `usePathname()` instead.
 */
export class NavigationPlugin {
  private readonly emit: EmitFn;
  private readonly sessionId: string;
  private previousPath = "";
  private originalPushState: typeof history.pushState | null = null;
  private originalReplaceState: typeof history.replaceState | null = null;

  constructor({ emit, sessionId }: NavigationPluginOptions) {
    this.emit = emit;
    this.sessionId = sessionId;
  }

  init(): void {
    // Record the initial page view on load.
    this.recordPageView(window.location.pathname + window.location.search);

    window.addEventListener("popstate", this.handlePopState);

    // Patch pushState
    this.originalPushState = history.pushState.bind(history);
    const origPush = this.originalPushState;
    history.pushState = (state, title, url): void => {
      origPush(state, title, url);
      this.handleNavigation();
    };

    // Patch replaceState
    this.originalReplaceState = history.replaceState.bind(history);
    const origReplace = this.originalReplaceState;
    history.replaceState = (state, title, url): void => {
      origReplace(state, title, url);
      this.handleNavigation();
    };
  }

  destroy(): void {
    window.removeEventListener("popstate", this.handlePopState);
    if (this.originalPushState) history.pushState = this.originalPushState;
    if (this.originalReplaceState)
      history.replaceState = this.originalReplaceState;
  }

  // Arrow property → always bound to `this`, safe to use as event listener.
  private handlePopState = (): void => {
    this.handleNavigation();
  };

  private handleNavigation(): void {
    const path = window.location.pathname + window.location.search;
    if (path === this.previousPath) return; // hash-only or duplicate call
    this.recordPageView(path);
  }

  private recordPageView(path: string): void {
    this.previousPath = path;

    this.emit({
      type: "pageview",
      data: {
        path,
        title: document.title,
        timestamp: Date.now(),
        sessionId: this.sessionId,
        referrer: document.referrer || undefined,
      },
    });

    // Notify other plugins via a custom DOM event (synchronous dispatch).
    window.dispatchEvent(
      new CustomEvent("tracker:navigate", {
        detail: { path, title: document.title },
      }),
    );
  }
}
