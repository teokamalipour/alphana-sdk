import { createContext, useContext } from "react";
import type { UserTracker } from "../tracker";

export const TrackerContext = createContext<UserTracker | null>(null);

/**
 * Returns the nearest `UserTracker` instance from context.
 * Returns `null` when called outside of a `<UserTrackerProvider>`.
 */
export function useTrackerContext(): UserTracker | null {
  return useContext(TrackerContext);
}
