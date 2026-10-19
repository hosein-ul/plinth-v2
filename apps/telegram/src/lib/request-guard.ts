import { isIP } from "node:net";
import type { NextRequest } from "next/server";

/** True when the request comes from this site's own origin. A missing, malformed or opaque ("null") Origin is a no.  */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

/**
 * The path after /api/proxy/ or /api/public/, or null when it is not a plain relative path. "." and ".." segments, encoded slashes
 * and backslashes are refused, so a caller cannot climb out of the prefix the route is allowed to reach.
 */
export function cleanTarget(path: string[]): string | null {
  for (const seg of path) {
    if (seg === "" || seg === "." || seg === ".." || /[\\/%]/.test(seg)) return null;
  }
  return path.join("/");
}

/** The caller's address for the API's per-client limits: the first entry of x-forwarded-for if it is a real IP, otherwise nothing. */
export function clientIp(req: NextRequest): string {
  const first = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
  return isIP(first) ? first : "";
}
