import { useEffect, useRef, type ReactNode } from "react";
import { UserTracker } from "../tracker";
import type { TrackerConfig } from "../types";
import { TrackerContext } from "./context";

export interface UserTrackerProviderProps {
  /** Tracker configuration. Captured on first render — changes are ignored. */
  config?: TrackerConfig;
  children: ReactNode;
}

/**
 * Wraps your application (or a subtree) and provides a `UserTracker` instance
 * via React context.
 *
 * The tracker is created once, initialized on mount, and destroyed on unmount.
 *
 * **Next.js App Router** — mark your layout wrapper as a Client Component:
 * ```tsx
 * 'use client';
 * import { UserTrackerProvider } from 'user-tracker/react';
 * export default function RootLayout({ children }) {
 *   return <UserTrackerProvider config={{ endpoint: '/api/events' }}>{children}</UserTrackerProvider>;
 * }
 * ```
 */
export function UserTrackerProvider({
  config = {},
  children,
}: UserTrackerProviderProps) {
  // Create the tracker instance exactly once (lazy ref initialisation).
  const trackerRef = useRef<UserTracker | null>(null);
  if (trackerRef.current === null) {
    trackerRef.current = new UserTracker(config);
  }

  useEffect(() => {
    const tracker = trackerRef.current!;
    tracker.init();
    return () => tracker.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <TrackerContext.Provider value={trackerRef.current}>
      {children}
    </TrackerContext.Provider>
  );
}
