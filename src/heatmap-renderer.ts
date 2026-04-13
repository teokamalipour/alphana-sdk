import type { HeatmapPoint, HeatmapRenderOptions } from "./types";

// ─── Color palette ────────────────────────────────────────────────────────────
// Built once; maps 0 (cool) → 255 (hot) to an RGB color.

type RGB = [number, number, number];

function buildPalette(): RGB[] {
  const stops: RGB[] = [
    [0, 0, 255], // blue
    [0, 255, 255], // cyan
    [0, 255, 0], // green
    [255, 255, 0], // yellow
    [255, 128, 0], // orange
    [255, 0, 0], // red
  ];

  const palette: RGB[] = [];
  const stepsPerSegment = 51; // ≈ 255 total entries

  for (let s = 0; s < stops.length - 1; s++) {
    const [fr, fg, fb] = stops[s];
    const [tr, tg, tb] = stops[s + 1];
    for (let i = 0; i < stepsPerSegment; i++) {
      const t = i / stepsPerSegment;
      palette.push([
        Math.round(fr + (tr - fr) * t),
        Math.round(fg + (tg - fg) * t),
        Math.round(fb + (tb - fb) * t),
      ]);
    }
  }

  return palette;
}

const COLOR_PALETTE = buildPalette();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Renders `points` onto `canvas` as a color heatmap.
 *
 * Algorithm:
 *   1. Draw each point as a soft radial gradient on an off-screen canvas,
 *      accumulating "heat" in the alpha channel.
 *   2. Map each pixel's accumulated alpha value through the color palette
 *      (blue → cyan → green → yellow → orange → red) and write to the
 *      destination canvas.
 *
 * Coordinates in `HeatmapPoint` are percentages (0–100) of page dimensions,
 * which are scaled to the canvas size at render time — making it resolution
 * independent.
 *
 * @param canvas  Target canvas element (will NOT be resized automatically).
 * @param points  Array of heatmap points to render.
 * @param options Visual tuning options.
 */
export function renderHeatmap(
  canvas: HTMLCanvasElement,
  points: HeatmapPoint[],
  options: HeatmapRenderOptions = {},
): void {
  const { radius = 25, maxOpacity = 0.85, minOpacity = 0 } = options;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  if (points.length === 0) return;

  // ── Step 1: draw density layer on off-screen canvas ──
  const shadow = document.createElement("canvas");
  shadow.width = width;
  shadow.height = height;
  const sCtx = shadow.getContext("2d");
  if (!sCtx) return;

  for (const pt of points) {
    const x = (pt.xPct / 100) * width;
    const y = (pt.yPct / 100) * height;
    // Clicks get a larger radius to make them visually distinct.
    const r = pt.type === "click" ? radius * 1.6 : radius;

    const grad = sCtx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(0,0,0,0.15)");
    grad.addColorStop(1, "rgba(0,0,0,0)");

    sCtx.fillStyle = grad;
    sCtx.beginPath();
    sCtx.arc(x, y, r, 0, Math.PI * 2);
    sCtx.fill();
  }

  // ── Step 2: colorize density layer ──
  const density = sCtx.getImageData(0, 0, width, height);
  const out = ctx.createImageData(width, height);
  const src = density.data;
  const dst = out.data;
  const lastIdx = COLOR_PALETTE.length - 1;

  for (let i = 0; i < src.length; i += 4) {
    const alpha = src[i + 3];
    if (alpha === 0) continue;

    const ratio = alpha / 255;
    const colorIdx = Math.min(Math.floor(ratio * lastIdx), lastIdx);
    const [r, g, b] = COLOR_PALETTE[colorIdx];
    const opacity = minOpacity + ratio * (maxOpacity - minOpacity);

    dst[i] = r;
    dst[i + 1] = g;
    dst[i + 2] = b;
    dst[i + 3] = Math.round(opacity * 255);
  }

  ctx.putImageData(out, 0, 0);
}
