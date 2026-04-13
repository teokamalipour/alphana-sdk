// Core
export { UserTracker } from "./tracker";
export { LogCapture } from "./core/logger";

// Renderer
export { renderHeatmap } from "./heatmap-renderer";

// Types
export type {
  TrackerConfig,
  TrackerEvent,
  PageView,
  TimeSpent,
  HeatmapPoint,
  SessionData,
  GeoLocation,
  HeatmapRenderOptions,
} from "./types";
export type { LogLevel, LogEntry } from "./core/logger";
