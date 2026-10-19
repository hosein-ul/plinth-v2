import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { assertSafeWebhookUrl, isBlockedAddress, pinnedPost } from "../src";

describe("webhook target guard", () => {
  const blocked = [
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "198.18.0.1", "224.0.0.1", "255.255.255.255",
    "::1", "::", "fd12::1", "fe80::1", "fec0::1", "ff02::1",
    // IPv4 addresses written inside IPv6, the forms a "starts with 127." test misses
    "::ffff:7f00:1", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe", "::ffff:a00:5", "::ffff:c0a8:101", "0:0:0:0:0:ffff:7f00:1", "64:ff9b::7f00:1",
    "not-an-ip",
  ];
  const allowed = ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:808:808"];

  it.each(blocked)("blocks %s", (ip) => expect(isBlockedAddress(ip)).toBe(true));
  it.each(allowed)("allows %s", (ip) => expect(isBlockedAddress(ip)).toBe(false));

  it("rejects private literals at creation time, in every notation", async () => {
    for (const u of ["https://127.0.0.1/h", "https://[::1]/h", "https://[::ffff:127.0.0.1]/h", "https://[::ffff:a9fe:a9fe]/h", "https://2130706433/h", "https://0x7f.1/h"]) {
      await expect(assertSafeWebhookUrl(u, false), u).rejects.toMatchObject({ code: "INVALID_URL" });
    }
    await expect(assertSafeWebhookUrl("http://example.com/h", false)).rejects.toMatchObject({ code: "INVALID_URL" });
  });
});

describe("pinned webhook delivery", () => {
  async function sink(body = "ok", status = 200) {
    const received: string[] = [];
    const server = createServer((req, res) => {
      let b = "";
      req.on("data", (c) => (b += c));
      req.on("end", () => {
        received.push(b);
        res.statusCode = status;
        res.end(body);
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`, received, close: () => server.close() };
  }

  it("never connects to a private address when private targets are not allowed", async () => {
    const s = await sink();
    try {
      await expect(pinnedPost(s.url, { headers: { "content-type": "application/json" }, body: "{}", timeoutMs: 2000, allowPrivate: false })).rejects.toThrow(/private address/);
      await expect(pinnedPost("http://localhost:" + new URL(s.url).port + "/hook", { headers: {}, body: "{}", timeoutMs: 2000, allowPrivate: false })).rejects.toThrow(/private address/);
      expect(s.received).toHaveLength(0);
    } finally {
      s.close();
    }
  });

  it("delivers to a local development target when that is explicitly allowed, and reports status and a body prefix", async () => {
    const s = await sink("x".repeat(5000), 202);
    try {
      const r = await pinnedPost(s.url, { headers: { "content-type": "application/json" }, body: '{"a":1}', timeoutMs: 2000, allowPrivate: true, maxBytes: 300 });
      expect(r.status).toBe(202);
      expect(r.text.length).toBeLessThanOrEqual(300);
      expect(s.received).toEqual(['{"a":1}']);
    } finally {
      s.close();
    }
  });

  it("does not follow redirects", async () => {
    const target = await sink();
    const redirector = createServer((_req, res) => {
      res.statusCode = 302;
      res.setHeader("location", target.url);
      res.end();
    });
    await new Promise<void>((r) => redirector.listen(0, "127.0.0.1", r));
    try {
      const r = await pinnedPost(`http://127.0.0.1:${(redirector.address() as AddressInfo).port}/`, { headers: {}, body: "{}", timeoutMs: 2000, allowPrivate: true });
      expect(r.status).toBe(302);
      expect(target.received).toHaveLength(0);
    } finally {
      redirector.close();
      target.close();
    }
  });
});
