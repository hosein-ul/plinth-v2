import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";

/**
 * Outbound requests to merchant-supplied URLs (webhooks). Two rules keep them from reaching our own network:
 *  1. every address the host resolves to is checked against the special-use ranges, including IPv4 addresses written inside IPv6
 *     (::ffff:7f00:1, 64:ff9b::7f00:1) which a plain "does it start with 127." test misses;
 *  2. the connection is made to the address that was checked. The check runs inside the socket's own DNS lookup, so a host that
 *     answers differently the second time (DNS rebinding) cannot slip a private address in between check and connect.
 */

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128], ["::1", 128], ["100::", 64], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) blocked.addSubnet(net, prefix, "ipv6");

/** Expand an IPv6 text address to its eight 16-bit groups, or null when it is not valid IPv6. */
function groupsOf(ip: string): number[] | null {
  const bare = ip.split("%")[0]!.toLowerCase();
  if (isIP(bare) !== 6) return null;
  let text = bare;
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) {
    const o = dotted[1]!.split(".").map(Number);
    text = text.slice(0, -dotted[1]!.length) + ((o[0]! << 8) | o[1]!).toString(16) + ":" + ((o[2]! << 8) | o[3]!).toString(16);
  }
  const [head, tail] = text.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const fill = tail === undefined ? [] : Array(8 - h.length - t.length).fill("0");
  const all = [...h, ...fill, ...t].map((g) => parseInt(g || "0", 16));
  return all.length === 8 && all.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? all : null;
}

const v4of = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

/** True when the address must never be contacted on a merchant's behalf. Unparseable input counts as blocked. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address.split("%")[0]!);
  if (family === 0) return true;
  if (family === 4) return blocked.check(address, "ipv4");
  const g = groupsOf(address);
  if (!g) return true;
  const embeddedV4 = g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff; // ::ffff:a.b.c.d
  if (embeddedV4) return blocked.check(v4of(g[6]!, g[7]!), "ipv4");
  const nat64 = g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0); // 64:ff9b::/96
  if (nat64) return blocked.check(v4of(g[6]!, g[7]!), "ipv4");
  return blocked.check(address.split("%")[0]!, "ipv6");
}

function guardedLookup(allowPrivate: boolean): typeof dnsLookup {
  return ((hostname: string, options: { all?: boolean; family?: number }, cb: (...a: unknown[]) => void) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addrs) => {
      if (err) return cb(err);
      const list = addrs as LookupAddress[];
      if (!allowPrivate && list.some((a) => isBlockedAddress(a.address))) return cb(new Error("Webhook host resolves to a private address"));
      if (options.all) return cb(null, list);
      return cb(null, list[0]!.address, list[0]!.family);
    });
  }) as typeof dnsLookup;
}

export interface PinnedResponse {
  status: number;
  /** The first bytes of the body, for the delivery log. */
  text: string;
}

/** POST a body to a URL, connecting only to addresses that passed the check above. Redirects are never followed. */
export function pinnedPost(url: string, opts: { headers: Record<string, string>; body: string; timeoutMs: number; allowPrivate: boolean; maxBytes?: number }): Promise<PinnedResponse> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (!opts.allowPrivate && isIP(host) && isBlockedAddress(host)) return reject(new Error("Webhook URL resolves to a private address"));
    const mod = u.protocol === "http:" ? http : https;
    const req = mod.request(
      {
        protocol: u.protocol, hostname: host, port: u.port || undefined, path: `${u.pathname}${u.search}`, method: "POST",
        headers: { ...opts.headers, "content-length": String(Buffer.byteLength(opts.body)) },
        lookup: guardedLookup(opts.allowPrivate) as never,
        timeout: opts.timeoutMs,
      },
      (res) => {
        const max = opts.maxBytes ?? 1024;
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size <= max) chunks.push(c);
          else res.destroy();
        });
        const done = () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8").slice(0, max) });
        res.on("end", done);
        res.on("close", done);
        res.on("error", done);
      },
    );
    req.on("timeout", () => req.destroy(new Error("The webhook endpoint timed out")));
    req.on("error", reject);
    req.end(opts.body);
  });
}
