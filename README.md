# alphana-sdk

Client-side analytics SDK for React, Next.js, Vite, and vanilla JS/TS projects. Tracks navigation, time-on-page, heatmaps, error logs, and periodic page screenshots — all without cookies or third parties.

## Installation

```bash
npm install alphana-sdk
# pnpm
pnpm add alphana-sdk
# yarn
yarn add alphana-sdk
# bun
bun add alphana-sdk
```

---

## Quick start

### React / Vite

```tsx
// main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { UserTrackerProvider } from 'alphana-sdk/react';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UserTrackerProvider
      config={{
        appId: import.meta.env.VITE_TRACKER_APP_ID,
        secretKey: import.meta.env.VITE_TRACKER_SECRET,
      }}
    >
      <App />
    </UserTrackerProvider>
  </StrictMode>,
);
```

```bash
# .env.local
VITE_TRACKER_APP_ID=your_app_id
VITE_TRACKER_SECRET=your_secret_key
```

### Next.js App Router

Because App Router renders server-side by default, wrap the provider in a Client Component:

```tsx
// app/providers.tsx
'use client';
import { UserTrackerProvider } from 'alphana-sdk/react';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <UserTrackerProvider
      config={{
        appId: process.env.NEXT_PUBLIC_TRACKER_APP_ID!,
        secretKey: process.env.NEXT_PUBLIC_TRACKER_SECRET!,
      }}
    >
      {children}
    </UserTrackerProvider>
  );
}
```

```tsx
// app/layout.tsx
import { Providers } from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

```bash
# .env.local
NEXT_PUBLIC_TRACKER_APP_ID=your_app_id
NEXT_PUBLIC_TRACKER_SECRET=your_secret_key
```

> **App Router page tracking:** The provider automatically intercepts `pushState` / `popstate`. For App Router you can optionally add an explicit page-view call using the `usePageView` hook in a Client Component:
>
> ```tsx
> // app/components/NavigationTracker.tsx
> 'use client';
> import { usePathname } from 'next/navigation';
> import { usePageView } from 'alphana-sdk/react';
>
> export function NavigationTracker() {
>   usePageView(usePathname());
>   return null;
> }
> ```

### Vanilla JS / TypeScript

```ts
import { UserTracker } from 'alphana-sdk';

const tracker = new UserTracker({
  appId: 'YOUR_APP_ID',
  secretKey: 'YOUR_SECRET_KEY',
});

tracker.init(); // attach listeners; no-op in SSR environments

// Call on teardown / logout
tracker.destroy();
```

---

## Configuration reference

| Option               | Type                            | Default                                 | Description                                                                        |
| -------------------- | ------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------- |
| `appId`              | `string`                        | —                                       | **Required.** Your app ID from the Alphana dashboard.                              |
| `secretKey`          | `string`                        | —                                       | **Required.** SDK secret key — sent as `Authorization: Bearer`.                    |
| `endpoint`           | `string`                        | `https://api.alphana.ir/api/events`     | Override only when self-hosting.                                                   |
| `sessionId`          | `string`                        | auto UUID                               | Override the auto-generated session identifier.                                    |
| `trackNavigation`    | `boolean`                       | `true`                                  | Intercept `pushState` / `popstate` for SPA route changes.                          |
| `trackTime`          | `boolean`                       | `true`                                  | Measure time spent on each page.                                                   |
| `trackHeatmap`       | `boolean`                       | `true`                                  | Record mouse-move, click, and scroll positions.                                    |
| `trackLogs`          | `boolean`                       | `true`                                  | Capture `console.info/warn/error`, `window.onerror`, and `unhandledrejection`.     |
| `trackSnapshots`     | `boolean`                       | `true`                                  | Send a full-page screenshot every interval (requires `html2canvas`).               |
| `snapshotIntervalMs` | `number` (ms)                   | `300000` (5 min)                        | How often to capture a snapshot when `trackSnapshots` is enabled.                  |
| `mouseSampleRate`    | `number` (0–1)                  | `0.3`                                   | Fraction of mouse/scroll events to record.                                         |
| `maxHeatmapPoints`   | `number`                        | `2000`                                  | Maximum in-memory heatmap points per page.                                         |
| `batchSize`          | `number`                        | `20`                                    | Events queued before an automatic batch flush.                                     |
| `flushInterval`      | `number` (ms)                   | `5000`                                  | Milliseconds between automatic flushes regardless of queue size.                   |
| `onEvent`            | `(event: TrackerEvent) => void` | —                                       | Callback invoked synchronously for every emitted event.                            |

---

## API

### `UserTracker`

```ts
import { UserTracker } from 'alphana-sdk';

const tracker = new UserTracker({ appId: 'id', secretKey: 'sk' });

tracker.init();                         // attach listeners; no-op in SSR; returns `this`
tracker.destroy();                      // remove all listeners and timers, flush remaining queue

tracker.trackPageView(path?: string);   // manually record a page view

tracker.getSession();                   // SessionData snapshot for the current session
tracker.getPageViews();                 // PageView[] recorded this session
tracker.getTimeSpent();                 // Record<path, ms> cumulative time per path
tracker.getHeatmapData(path?: string);  // HeatmapPoint[] for path, or all paths if omitted

tracker.flush();                        // immediately POST all queued events
tracker.subscribe(fn);                  // register an event listener; returns an unsubscribe fn
```

**Heartbeat:** The SDK emits a `session:heartbeat` event every 30 seconds to keep the session alive.

**Page-hide flush:** On `visibilitychange` (tab hidden or browser minimised) the SDK calls `navigator.sendBeacon` to ensure no events are dropped.

### `LogCapture`

Automatically used by `UserTracker` when `trackLogs: true`. Can also be used standalone:

```ts
import { LogCapture } from 'alphana-sdk';

const capture = new LogCapture({
  endpoint: 'https://your-backend.com/api/events',
  sessionId: 'ses_abc123',
  appId: 'YOUR_APP_ID',
  secretKey: 'sk_...',
});

capture.init();    // patches console.info/warn/error, window.onerror, unhandledrejection
capture.destroy(); // restores original methods
```

### `renderHeatmap`

Renders a `HeatmapPoint[]` array onto a `<canvas>` element using a blue → red color palette.

```ts
import { renderHeatmap } from 'alphana-sdk';

const canvas = document.getElementById('heatmap') as HTMLCanvasElement;
canvas.width  = 1280;
canvas.height = 720;

renderHeatmap(canvas, points, {
  radius:     25,    // blur radius in px       (default: 25)
  maxOpacity: 0.85,  // max alpha for hotspots  (default: 0.85)
  minOpacity: 0,     // min alpha for cold areas (default: 0)
});
```

### `DEFAULT_ENDPOINT`

The default API URL is exported if you need it:

```ts
import { DEFAULT_ENDPOINT } from 'alphana-sdk';
// "https://api.alphana.ir/api/events"
```

---

## React hooks

All hooks are exported from `alphana/react`.

| Hook                                 | Returns            | Description                                                        |
| ------------------------------------ | ------------------ | ------------------------------------------------------------------ |
| `useTracker()`                       | `UserTracker`      | Access the tracker instance from context.                          |
| `usePageView(path?)`                 | `void`             | Record a page view when `path` changes (App Router helper).        |
| `useHeatmapData(path?, refreshMs?)`  | `HeatmapPoint[]`   | Live heatmap points for a path, polled every `refreshMs` (500 ms). |
| `usePageViews()`                     | `PageView[]`       | All page views recorded in the current session.                    |
| `useTimeSpent()`                     | `number` (seconds) | Total time spent on the current page (updates every second).       |

```tsx
import { useTracker, useTimeSpent, useHeatmapData } from 'alphana-sdk/react';

export function DebugPanel() {
  const tracker   = useTracker();
  const timeSpent = useTimeSpent();   // seconds on this page
  const points    = useHeatmapData(); // HeatmapPoint[]

  return (
    <div>
      <p>Time on page: {timeSpent}s</p>
      <p>Heatmap points: {points.length}</p>
      <button onClick={() => tracker.flush()}>Flush now</button>
    </div>
  );
}
```

---

## TypeScript types

```ts
import type {
  TrackerConfig,
  TrackerEvent,
  PageView,
  TimeSpent,
  HeatmapPoint,
  SessionData,
  GeoLocation,
  LogLevel,
  LogEntry,
  HeatmapRenderOptions,
} from 'alphana-sdk';
```

---

## Self-hosting

The full backend, dashboard, and landing page are open source. To run on your own infrastructure:

```bash
git clone https://github.com/teokamalipour/alphana-sdk.git
cd alphana-sdk
cp .env.example .env   # fill in your values
docker compose up -d   # starts MongoDB, NestJS backend, and React dashboard
```

Then point the SDK at your server:

```ts
new UserTracker({
  appId: 'YOUR_APP_ID',
  secretKey: 'YOUR_SECRET_KEY',
  endpoint: 'https://your-server.example.com/api/events',
});
```
