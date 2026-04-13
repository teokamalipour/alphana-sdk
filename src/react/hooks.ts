import { useEffect, useRef, useState } from "react";
import type { HeatmapPoint, PageView, TrackerEvent } from "../types";
import { useTrackerContext } from "./context";

// ─── useTracker ───────────────────────────────────────────────────────────────

/**
 * Returns the `UserTracker` instance from the nearest `<UserTrackerProvider>`.
 * Returns `null` when called outside of a provider.
 */
export function useTracker() {
  return useTrackerContext();
}

// ─── usePageView ──────────────────────────────────────────────────────────────

/**
 * Manually records a page view whenever `path` changes.
 *
 * Pass the current pathname — particularly useful with Next.js App Router:
 * ```tsx
 * 'use client';
 * import { usePathname } from 'next/navigation';
 * import { usePageView } from 'user-tracker/react';
 *
 * export function NavigationTracker() {
 *   usePageView(usePathname());
 *   return null;
 * }
 * ```
 * When no `path` is provided the hook is a no-op (automatic tracking via the
 * NavigationPlugin handles it).
 */
export function usePageView(path?: string): void {
  const tracker = useTrackerContext();
  useEffect(() => {
    if (tracker && path !== undefined) {
      tracker.trackPageView(path);
    }
    // Re-fire when the path changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
}

// ─── useHeatmapData ───────────────────────────────────────────────────────────

/**
 * Returns a live array of `HeatmapPoint` objects for the given path (defaults
 * to `window.location.pathname`).
 *
 * The state is updated in batches — at most once every `refreshMs` ms — to
 * avoid a re-render on every single mouse move.
 *
 * @param path       The page path to query. Defaults to the current pathname.
 * @param refreshMs  Minimum interval between state updates. Default: 500.
 */
export function useHeatmapData(path?: string, refreshMs = 500): HeatmapPoint[] {
  const tracker = useTrackerContext();
  const [data, setData] = useState<HeatmapPoint[]>([]);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (!tracker) return;

    const targetPath =
      path ?? (typeof window !== "undefined" ? window.location.pathname : "/");

    const refresh = (): void => {
      setData(tracker.getHeatmapData(targetPath) as HeatmapPoint[]);
      pendingRef.current = false;
    };

    // Initial read.
    refresh();

    // Re-read after each new heatmap point, debounced by refreshMs.
    const unsub = tracker.subscribe((event: TrackerEvent) => {
      if (event.type === "heatmap" && event.data.path === targetPath) {
        if (!pendingRef.current) {
          pendingRef.current = true;
          setTimeout(refresh, refreshMs);
        }
      }
    });

    return unsub;
    // refreshMs is intentionally excluded — changing it after mount has no effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracker, path]);

  return data;
}

// ─── usePageViews ─────────────────────────────────────────────────────────────

/**
 * Returns a live array of all page views recorded in the current session.
 */
export function usePageViews(): PageView[] {
  const tracker = useTrackerContext();
  const [views, setViews] = useState<PageView[]>([]);

  useEffect(() => {
    if (!tracker) return;

    setViews(tracker.getPageViews());

    const unsub = tracker.subscribe((event: TrackerEvent) => {
      if (event.type === "pageview") {
        setViews(tracker.getPageViews());
      }
    });

    return unsub;
  }, [tracker]);

  return views;
}

// ─── useTimeSpent ─────────────────────────────────────────────────────────────

/**
 * Returns a live record of cumulative milliseconds spent per path.
 */
export function useTimeSpent(): Record<string, number> {
  const tracker = useTrackerContext();
  const [time, setTime] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!tracker) return;

    setTime(tracker.getTimeSpent());

    const unsub = tracker.subscribe((event: TrackerEvent) => {
      if (event.type === "timespent") {
        setTime(tracker.getTimeSpent());
      }
    });

    return unsub;
  }, [tracker]);

  return time;
}
