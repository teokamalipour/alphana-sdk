import type { GeoLocation } from "../types";

/**
 * Resolves the visitor's approximate location from their public IP address
 * using the ipapi.co free-tier JSON endpoint (no API-key required, up to
 * 1 000 requests/day on the free plan).
 *
 * Runs silently — returns `null` on any network error, rate-limit, or
 * reserved/private IP so that tracking is never blocked.
 */
export async function fetchLocation(): Promise<GeoLocation | null> {
  try {
    const res = await fetch("https://ipapi.co/json/", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const d = (await res.json()) as Record<string, unknown>;
    // ipapi returns { "error": true, "reason": "..." } for private/reserved IPs
    if (d["error"]) return null;
    return {
      country: typeof d["country_code"] === "string" ? d["country_code"] : "",
      countryName:
        typeof d["country_name"] === "string" ? d["country_name"] : "",
      city: typeof d["city"] === "string" ? d["city"] : undefined,
      region: typeof d["region"] === "string" ? d["region"] : undefined,
      latitude: typeof d["latitude"] === "number" ? d["latitude"] : undefined,
      longitude:
        typeof d["longitude"] === "number" ? d["longitude"] : undefined,
    };
  } catch {
    return null;
  }
}
