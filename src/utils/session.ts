const SESSION_STORAGE_KEY = "__ut_sid__";

/** Generate a RFC-4122 v4 UUID using the native crypto API with a fallback. */
export function generateSessionId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  // Math.random fallback (not cryptographically secure, but sufficient for analytics)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Retrieve the session ID from sessionStorage, or create and persist a new one.
 * Falls back to an in-memory ID when sessionStorage is unavailable (e.g. SSR).
 */
export function getOrCreateSessionId(): string {
  if (typeof sessionStorage === "undefined") return generateSessionId();
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const id = generateSessionId();
    sessionStorage.setItem(SESSION_STORAGE_KEY, id);
    return id;
  } catch {
    return generateSessionId();
  }
}
