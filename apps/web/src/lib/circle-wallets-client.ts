/**
 * Circle Wallets sign-in in the browser. Circle's own SDK shows the one-time-code screen; this file only moves the tokens between
 * that screen and our server. The Circle API key never reaches the browser (only the public App ID does).
 */
export const CIRCLE_APP_ID = process.env.NEXT_PUBLIC_CIRCLE_APP_ID?.trim() ?? "";

export class CircleCancelled extends Error {}

interface OtpStart {
  deviceToken: string;
  deviceEncryptionKey: string;
  otpToken: string;
}

/** Sends the code, opens Circle's code screen, and resolves with the user token once the code is right. */
export async function getCircleUserToken(email: string): Promise<string> {
  const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
  let settle!: { ok: (t: string) => void; fail: (e: Error) => void };
  const result = new Promise<string>((ok, fail) => (settle = { ok, fail }));
  const sdk = new W3SSdk({ appSettings: { appId: CIRCLE_APP_ID } }, (error: unknown, res: unknown) => {
    const token = (res as { userToken?: string } | undefined)?.userToken;
    if (error || !token) settle.fail(new CircleCancelled(error instanceof Error ? error.message : "The code was not confirmed."));
    else settle.ok(token);
  });
  const deviceId = await sdk.getDeviceId();
  const res = await fetch("/api/auth/circle/otp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ device_id: deviceId, email }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? "Could not send the code.");
  const t = json as OtpStart;
  sdk.updateConfigs({ appSettings: { appId: CIRCLE_APP_ID }, loginConfigs: { deviceToken: t.deviceToken, deviceEncryptionKey: t.deviceEncryptionKey, otpToken: t.otpToken } });
  sdk.verifyOtp();
  return result;
}
