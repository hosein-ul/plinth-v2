"use client";
import { useEffect, useRef, useState } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/** Offered only when buying is switched on for this deployment (the server also refuses without a Circle key). */
export const ONRAMP_ENABLED = process.env.NEXT_PUBLIC_ONRAMP_ENABLED === "true";

/**
 * Buy USDC with a card or bank transfer from inside the checkout, delivered to the payer's own wallet. Circle's widget does the
 * identity checks and takes the payment; Plinth only asks for a session and never sees card details.
 */
export function BuyUsdc({ paymentId, address, sym = "USDC" }: { paymentId: string; address: string; sym?: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "submitted" | "failed">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const widget = useRef<{ close: () => void } | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setState("loading");
    setMessage(null);
    // The container is attached once the dialog has rendered, so wait a moment before mounting.
    const t = setTimeout(async () => {
      try {
        const { AppKit } = await import("@circle-fin/app-kit");
        const widgetBaseUrl = process.env.NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL;
        const kit = new AppKit(widgetBaseUrl ? { onramp: { widgetBaseUrl } } : undefined);
        const session = await kit.onramp.fetchSession({ url: "/api/onramp/sessions", body: { appUserId: paymentId, destinationAddress: address } });
        if (!live || !root.current) return;
        widget.current = kit.onramp.mountIframe({
          session,
          container: root.current,
          onDepositSubmitted: () => live && setState("submitted"),
          onDepositSettled: () => live && setState("submitted"),
          onDepositNotCompleted: () => live && setMessage("The purchase was not completed. Nothing was charged."),
        } as never);
        setState("ready");
      } catch (e) {
        if (!live) return;
        setState("failed");
        setMessage(e instanceof Error ? e.message.split("\n")[0]! : "Could not open the purchase window.");
      }
    }, 50);
    return () => {
      live = false;
      clearTimeout(t);
      widget.current?.close();
      widget.current = null;
    };
  }, [open, paymentId, address]);

  return (
    <>
      <Button variant="secondary" size="md" onClick={() => setOpen(true)}><CreditCard className="size-4" aria-hidden />Buy {sym} with a card</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={`Buy ${sym}`} description="Circle takes the payment and sends it to your wallet. You come back here to pay." className="max-w-[30rem]">
          <div ref={root} className="h-[640px] w-full overflow-hidden rounded-ctl bg-wash" />
          {state === "loading" && <p className="mt-2 text-sm text-ink-3" role="status">Opening…</p>}
          {state === "submitted" && <p className="mt-2 text-sm text-ink-2" role="status">Purchase submitted. Your {sym} arrives in your wallet shortly; close this window and continue.</p>}
          {message && <p className="mt-2 text-sm text-bad-ink" role="alert">{message}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
