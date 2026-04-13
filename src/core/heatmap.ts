import type { TrackerEvent, HeatmapPoint } from "../types";
import { throttle } from "../utils/throttle";

type EmitFn = (event: TrackerEvent) => void;

interface HeatmapPluginOptions {
  emit: EmitFn;
  sessionId: string;
  /** Fraction of mousemove / scroll events to sample (0–1). Default: 0.3 */
  sampleRate?: number;
  /** Maximum points stored per page before recording stops. Default: 2000 */
  maxPoints?: number;
}

/**
 * Collects mouse-move, click, and scroll positions for heatmap analysis.
 *
 * Coordinates are stored both as absolute pixels and as percentages of the
 * full page dimensions so data stays meaningful across different screen sizes.
 *
 * Mouse moves and scroll events are throttled (50 ms) and further reduced by
 * the configurable `sampleRate`. Clicks are never sampled — each one is always
 * recorded (up to `maxPoints`).
 */
export class HeatmapPlugin {
  private readonly emit: EmitFn;
  private readonly sessionId: string;
  private readonly sampleRate: number;
  private readonly maxPoints: number;
  private currentPath = "";
  private pointCounts: Record<string, number> = {};

  private readonly throttledMouseMove: (e: MouseEvent) => void;
  private readonly throttledScroll: () => void;

  constructor({
    emit,
    sessionId,
    sampleRate = 0.3,
    maxPoints = 2000,
  }: HeatmapPluginOptions) {
    this.emit = emit;
    this.sessionId = sessionId;
    this.sampleRate = sampleRate;
    this.maxPoints = maxPoints;

    this.throttledMouseMove = throttle(this.handleMouseMove, 50);
    this.throttledScroll = throttle(this.handleScroll, 100);
  }

  init(): void {
    this.currentPath = window.location.pathname + window.location.search;

    document.addEventListener("mousemove", this.throttledMouseMove);
    document.addEventListener("click", this.handleClick);
    window.addEventListener("scroll", this.throttledScroll, { passive: true });
    window.addEventListener("tracker:navigate", this.handleNavigate);
  }

  destroy(): void {
    document.removeEventListener("mousemove", this.throttledMouseMove);
    document.removeEventListener("click", this.handleClick);
    window.removeEventListener("scroll", this.throttledScroll);
    window.removeEventListener("tracker:navigate", this.handleNavigate);
  }

  private canRecord(): boolean {
    return (this.pointCounts[this.currentPath] ?? 0) < this.maxPoints;
  }

  private recordPoint(
    point: Omit<HeatmapPoint, "path" | "timestamp" | "sessionId">,
  ): void {
    if (!this.canRecord()) return;
    this.pointCounts[this.currentPath] =
      (this.pointCounts[this.currentPath] ?? 0) + 1;
    this.emit({
      type: "heatmap",
      data: {
        ...point,
        path: this.currentPath,
        timestamp: Date.now(),
      },
    });
  }

  private handleMouseMove = (e: MouseEvent): void => {
    if (Math.random() > this.sampleRate) return;
    const pageWidth = document.documentElement.scrollWidth;
    const pageHeight = document.documentElement.scrollHeight;
    const absY = e.clientY + window.scrollY;
    this.recordPoint({
      x: e.clientX,
      y: absY,
      xPct: pageWidth > 0 ? (e.clientX / pageWidth) * 100 : 0,
      yPct: pageHeight > 0 ? (absY / pageHeight) * 100 : 0,
      type: "move",
    });
  };

  private handleClick = (e: MouseEvent): void => {
    const pageWidth = document.documentElement.scrollWidth;
    const pageHeight = document.documentElement.scrollHeight;
    const absY = e.clientY + window.scrollY;
    this.recordPoint({
      x: e.clientX,
      y: absY,
      xPct: pageWidth > 0 ? (e.clientX / pageWidth) * 100 : 0,
      yPct: pageHeight > 0 ? (absY / pageHeight) * 100 : 0,
      type: "click",
    });
  };

  private handleScroll = (): void => {
    if (Math.random() > this.sampleRate) return;
    const pageWidth = document.documentElement.scrollWidth;
    const pageHeight = document.documentElement.scrollHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Record the centre of the visible viewport.
    const centerX = window.scrollX + vw / 2;
    const centerY = window.scrollY + vh / 2;
    this.recordPoint({
      x: vw / 2,
      y: centerY,
      xPct: pageWidth > 0 ? (centerX / pageWidth) * 100 : 0,
      yPct: pageHeight > 0 ? (centerY / pageHeight) * 100 : 0,
      type: "scroll",
    });
  };

  private handleNavigate = (e: CustomEvent<{ path: string }>): void => {
    this.currentPath = e.detail.path;
  };
}
