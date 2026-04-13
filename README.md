# alpha-tracker

Client-side analytics SDK. Tracks navigation, time-on-page and mouse heatmaps for any React, Next.js, Vite or vanilla JS/TS project.

## Installation

```bash
npm install alpha-tracker
# or
pnpm add alpha-tracker
# or
yarn add alpha-tracker
```

## Vanilla JS / TypeScript

```ts
import { UserTracker } from "alpha-tracker";

const tracker = new UserTracker({
  endpoint: "https://your-backend.com/api/events",
  secretKey: import.meta.env.VITE_TRACKER_SECRET,
});

tracker.init(); // start collecting
// tracker.destroy(); // call on teardown
```

## React / Next.js (Pages Router)

```tsx
// _app.tsx
import { UserTrackerProvider } from "alpha-tracker/react";

export default function App({ Component, pageProps }) {
  return (
    <UserTrackerProvider
      config={{
        endpoint: process.env.NEXT_PUBLIC_TRACKER_ENDPOINT,
        secretKey: process.env.NEXT_PUBLIC_TRACKER_SECRET,
      }}
    >
      <Component {...pageProps} />
    </UserTrackerProvider>
  );
}
```

## Next.js App Router

Because the App Router renders server-side by default you must mark the provider as a Client Component:

```tsx
// app/providers.tsx
"use client";
import { UserTrackerProvider } from "alpha-tracker/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <UserTrackerProvider
      config={{
        endpoint: process.env.NEXT_PUBLIC_TRACKER_ENDPOINT,
        secretKey: process.env.NEXT_PUBLIC_TRACKER_SECRET,
      }}
    >
      {children}
    </UserTrackerProvider>
  );
}

// app/layout.tsx
import { Providers } from "./providers";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### Tracking page changes in the App Router

```tsx
// app/components/NavigationTracker.tsx
"use client";
import { usePathname } from "next/navigation";
import { usePageView } from "alpha-tracker/react";

export function NavigationTracker() {
  usePageView(usePathname());
  return null;
}
```

Add `<NavigationTracker />` inside your root layout (inside `<Providers>`).

## Configuration reference

All options are optional.

| Option             | Type                            | Default | Description                                                         |
| ------------------ | ------------------------------- | ------- | ------------------------------------------------------------------- |
| `endpoint`         | `string`                        | —       | URL to POST events to (`/api/events` on your backend)               |
| `secretKey`        | `string`                        | —       | App secret key from the dashboard — sent as `Authorization: Bearer` |
| `sessionId`        | `string`                        | auto    | Override the auto-generated session UUID                            |
| `trackNavigation`  | `boolean`                       | `true`  | Intercept `pushState` / `popstate` for SPA route changes            |
| `trackTime`        | `boolean`                       | `true`  | Measure time spent on each page                                     |
| `trackHeatmap`     | `boolean`                       | `true`  | Collect mouse-move, click, and scroll positions                     |
| `trackLogs`        | `boolean`                       | `true`  | Capture `console.info/warn/error` and unhandled errors              |
| `mouseSampleRate`  | `number` (0–1)                  | `0.3`   | Fraction of mouse/scroll events to record                           |
| `maxHeatmapPoints` | `number`                        | `2000`  | Maximum in-memory heatmap points per page                           |
| `batchSize`        | `number`                        | `20`    | Events queued before an automatic batch flush                       |
| `flushInterval`    | `number` (ms)                   | `5000`  | Milliseconds between automatic flushes regardless of queue size     |
| `onEvent`          | `(event: TrackerEvent) => void` | —       | Callback invoked synchronously for every emitted event              |

## API

### `UserTracker`

```ts
const tracker = new UserTracker(config);

tracker.init();                        // attach listeners; no-op in SSR
tracker.destroy();                     // remove listeners, flush remaining queue

tracker.trackPageView(path?: string);  // manually record a page view

tracker.getSession();                  // read-only snapshot of the current SessionData
tracker.getPageViews();                // PageView[] recorded this session
tracker.getTimeSpent();                // Record<path, ms> cumulative time per path
tracker.getHeatmapData(path);         // HeatmapPoint[] for a specific path
tracker.getHeatmapData();             // Record<path, HeatmapPoint[]> for all paths

tracker.subscribe(fn);                 // register an event listener; returns unsub fn
```

### `LogCapture`

Automatically instantiated by `UserTracker` when `trackLogs: true` and an `endpoint` is set. You can also use it standalone to ship logs without the full SDK:

```ts
import { LogCapture } from "alpha-tracker";

const capture = new LogCapture({
  endpoint: "https://your-backend.com/api/events",
  sessionId: "my-session-id",
  secretKey: "sk_...",
});

capture.init(); // patches console.info/warn/error and window.onerror
capture.destroy(); // restores original console methods
```

### `renderHeatmap`

Renders a `HeatmapPoint[]` array onto a `<canvas>` element using a blue→red color palette:

```ts
import { renderHeatmap } from "alpha-tracker";

renderHeatmap(canvasElement, points, {
  radius: 25, // blur radius in pixels (default: 25)
  maxOpacity: 0.85, // maximum alpha for hot spots (default: 0.85)
  minOpacity: 0, // minimum alpha for cool areas (default: 0)
});
```

## React hooks

All hooks are exported from `alpha-tracker/react`.

| Hook                                | Returns                  | Description                                                       |
| ----------------------------------- | ------------------------ | ----------------------------------------------------------------- |
| `useTracker()`                      | `UserTracker \| null`    | Access the tracker instance from context                          |
| `usePageView(path?)`                | `void`                   | Record a page view when `path` changes (App Router helper)        |
| `useHeatmapData(path?, refreshMs?)` | `HeatmapPoint[]`         | Live heatmap points for a path, debounced by `refreshMs` (500 ms) |
| `usePageViews()`                    | `PageView[]`             | All page views recorded in the current session                    |
| `useTimeSpent()`                    | `Record<string, number>` | Cumulative milliseconds spent per path                            |

## Configuration

| Option             | Type              | Default | Description                            |
| ------------------ | ----------------- | ------- | -------------------------------------- |
| `endpoint`         | `string`          | —       | URL to POST events to                  |
| `secretKey`        | `string`          | —       | App secret from the dashboard          |
| `sessionId`        | `string`          | auto    | Override session ID                    |
| `trackNavigation`  | `boolean`         | `true`  | Track SPA route changes                |
| `trackTime`        | `boolean`         | `true`  | Track time-on-page                     |
| `trackHeatmap`     | `boolean`         | `true`  | Collect mouse/scroll data              |
| `mouseSampleRate`  | `number`          | `0.3`   | Fraction of mouse events sampled (0–1) |
| `maxHeatmapPoints` | `number`          | `2000`  | Max heatmap points stored in memory    |
| `onEvent`          | `(event) => void` | —       | Callback for every emitted event       |

## React hooks

```tsx
import {
  useTracker,
  usePageView,
  useHeatmapData,
  usePageViews,
  useTimeSpent,
} from "alpha-tracker/react";

// Access the tracker instance
const tracker = useTracker();

// Manually record a page view (required for Next.js App Router)
usePageView(pathname);

// Live heatmap data for the current page
const points = useHeatmapData("/about");

// All page views in the current session
const views = usePageViews();

// Cumulative milliseconds per path
const time = useTimeSpent();
```

## Rendering a heatmap

```ts
import { renderHeatmap } from "alpha-tracker";

const canvas = document.getElementById("heatmap") as HTMLCanvasElement;
canvas.width = 1280;
canvas.height = 720;

renderHeatmap(canvas, tracker.getHeatmapData("/"), {
  radius: 28,
  maxOpacity: 0.85,
});
```

## TypeScript types

All public types are re-exported from the root entry:

```ts
import type {
  TrackerConfig,
  TrackerEvent,
  PageView,
  TimeSpent,
  HeatmapPoint,
  SessionData,
  HeatmapRenderOptions,
} from "alpha-tracker";
```

## Building from source

```bash
pnpm --filter alpha-tracker build
```

Output goes to `packages/tracker/dist/`.
