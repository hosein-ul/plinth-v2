import { z } from "zod";
import { getAddress, type Hex } from "viem";
import { and, eq, schema, sql } from "@plinth/db";
import {
  createApiKeySchema, createInvoiceSchema, createPaymentIntentSchema, createPaymentLinkSchema, createRefundRequestSchema, createWebhookEndpointSchema,
  custodyScheduleSchema, custodyWithdrawalSchema, passwordChangeSchema, teamAddSchema, teamRemoveSchema, teamRoleSchema, emailChangeSchema, emailConfirmSchema, enableNetworkSchema, loginSchema, merchantFeeSchema, payoutChallengeSchema, payoutConfirmSchema, payoutVaultSchema, payoutWalletSchema, reauthSchema, web3authSchema, TOKEN_SYMBOLS, type TokenSymbol, selectAddressNetworkSchema, signupSchema, submitRefundProofSchema, txHashSchema, walletPrepareSchema, walletSubmitSchema, WEBHOOK_EVENT_TYPES,
} from "@plinth/shared";
import * as E from "@plinth/engine";
import type { Engine } from "@plinth/engine";
import { route, type RouteDef } from "./define";
import { FailureLimiter } from "./limits";

const id = z.string().min(3).max(80);
const limitQ = z.coerce.number().int().min(1).max(100).optional();

export function buildRoutes(e: Engine): RouteDef[] {
  const A = (a: E.AuthContext | null): E.AuthContext => {
    if (!a) throw new E.EngineError("UNAUTHENTICATED", "Authentication required", 401);
    return a;
  };
  const list = <T,>(data: T[], extra: object = {}) => ({ object: "list", data, ...extra });
  // Wrong passwords are counted per client address AND account, so guessing one account is slowed down.
  const loginFails = new FailureLimiter(8, 15 * 60_000);
  const bearerOf = (req: { headers: { authorization?: string } }) => String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");

  return [
    // ------------------------------------------------------------------ health & status
    route({ method: "GET", path: "/healthz", tag: "System", summary: "Liveness probe", auth: "none", handler: async () => ({ ok: true }) }),
    route({
      method: "GET", path: "/readyz", tag: "System", summary: "Readiness probe (database reachable)", auth: "none",
      handler: async () => { await e.db.execute(sql`select 1`); return { ok: true }; },
    }),
    route({
      method: "GET", path: "/public/status", tag: "System", summary: "Public network status for the status page", auth: "none",
      description: "Operational state per network and queue depth. Contains no merchant data.",
      handler: async () => {
        const nets = [];
        for (const c of e.chains.values()) {
          let head: string | null = null;
          let rpc = "unreachable";
          try { head = (await c.client.getBlockNumber()).toString(); rpc = "ok"; } catch { /* reported as unreachable */ }
          const [cur] = await e.db.select().from(schema.watcherCursors).where(eq(schema.watcherCursors.networkId, c.network.id));
          const paused = await E.isPaused(e, c.network.id);
          nets.push({ id: c.network.id, name: c.network.name, chain_id: c.network.chainId, environment: c.network.environment, native_currency: c.network.nativeCurrency, explorer_url: c.network.explorerUrl, public_rpc_urls: c.network.rpcUrls, usdc_address: c.network.usdc.address, operational: c.operational, rpc, head_block: head, scanned_block: cur?.lastScannedBlock.toString() ?? null, relayer: c.signer ? (paused.paused ? "paused" : "active") : "unavailable", wallet_checkout: c.operational && !!c.signer, address_checkout: c.operational });
        }
        return { checked_at: e.now().toISOString(), networks: nets };
      },
    }),

    // ------------------------------------------------------------------ auth (dashboard)
    route({
      method: "POST", path: "/v1/auth/signup", tag: "Auth", summary: "Create a merchant account", auth: "none", body: signupSchema, rateLimit: 10, successStatus: 201,
      handler: async ({ req, body }) => {
        await E.signup(e, body, { type: "SYSTEM", ip: req.ip });
        return E.login(e, body.email, body.password, { type: "USER", ip: req.ip });
      },
    }),
    route({
      method: "POST", path: "/v1/auth/login", tag: "Auth", summary: "Sign in to the dashboard", auth: "none", body: loginSchema, rateLimit: 10,
      response: "A session token. Treat as a password.",
      handler: async ({ req, body }) => {
        const key = `${req.ip}|${body.email.trim().toLowerCase()}`;
        const wait = loginFails.retryAfter(key);
        if (wait > 0) throw new E.EngineError("RATE_LIMITED", `Too many sign-in attempts. Retry in ${wait}s.`, 429);
        try {
          const out = await E.login(e, body.email, body.password, { type: "USER", ip: req.ip });
          loginFails.clear(key);
          return out;
        } catch (err) {
          if (err instanceof E.EngineError && err.code === "INVALID_CREDENTIALS") loginFails.fail(key);
          throw err;
        }
      },
    }),
    route({
      method: "POST", path: "/v1/auth/web3auth", tag: "Auth", summary: "Sign in or sign up with a Web3Auth identity token", auth: "none", body: web3authSchema, rateLimit: 10,
      response: "A session token. The identity token is verified against Web3Auth's published keys for this deployment's client id.",
      handler: async ({ req, body }) => {
        const identity = await E.verifyIdentity(e, body.id_token);
        return E.signInWithIdentity(e, identity, { business_name: body.business_name }, { type: "USER", ip: req.ip });
      },
    }),
    route({
      method: "POST", path: "/v1/auth/logout", tag: "Auth", summary: "End the current session", auth: "session",
      handler: async ({ req }) => { await E.logout(e, String(req.headers.authorization).replace(/^Bearer\s+/i, "")); return { ok: true }; },
    }),
    route({
      method: "POST", path: "/v1/auth/sessions/revoke-others", tag: "Auth", summary: "Sign out everywhere else", auth: "session", rateLimit: 10,
      description: "Ends every other dashboard session of the signed-in user and keeps the current one.",
      handler: async ({ req, auth }) => ({ revoked: await E.revokeSessions(e, { userId: A(auth).actor.id!, keepToken: bearerOf(req) }) }),
    }),
    route({
      method: "POST", path: "/v1/auth/password", tag: "Auth", summary: "Change the password", auth: "session", body: passwordChangeSchema, rateLimit: 6,
      description: "Needs the current password. Every other session of the user is ended.",
      handler: async ({ req, auth, body }) => E.changePassword(e, A(auth), body, bearerOf(req)),
    }),
    route({
      method: "GET", path: "/v1/auth/email", tag: "Auth", summary: "Email address status for the signed-in user", auth: "session",
      description: "Whether the account has a real email, whether it is verified, how the user signs in (so the dashboard knows how to ask for re-authentication) and whether this server can send email.",
      handler: async ({ auth }) => E.emailStatus(e, A(auth)),
    }),
    route({
      method: "POST", path: "/v1/auth/email/verify", tag: "Auth", summary: "Send a verification link to the account email", auth: "session", rateLimit: 6,
      handler: async ({ auth }) => E.requestEmailVerification(e, A(auth)),
    }),
    route({
      method: "POST", path: "/v1/auth/email/change", tag: "Auth", summary: "Add or replace the account email", auth: "session", body: emailChangeSchema, rateLimit: 6,
      description: "Needs a fresh sign-in (`reauth`): the current password, or a Web3Auth identity token issued in the last few minutes. The address only changes when the link sent to it is used.",
      handler: async ({ auth, body }) => E.requestEmailChange(e, A(auth), body),
    }),
    route({
      method: "POST", path: "/public/auth/email/confirm", tag: "Auth", summary: "Use the link from a verification email", auth: "none", body: emailConfirmSchema, rateLimit: 20,
      description: "Single use. The web app opens this from `/verify-email?token=…`.",
      handler: async ({ body }) => E.confirmEmailLink(e, body.token),
    }),
    route({
      method: "GET", path: "/v1/me", tag: "Auth", summary: "Current merchant, role and environment", auth: "merchant",
      handler: async ({ auth }) => {
        const a = A(auth);
        const [m] = await e.db.select().from(schema.merchants).where(eq(schema.merchants.id, a.merchantId));
        const [u] = a.actor.type === "USER" && a.actor.id ? await e.db.select().from(schema.merchantUsers).where(eq(schema.merchantUsers.id, a.actor.id)) : [];
        return { merchant: { id: m!.id, name: m!.name, underpayment_tolerance_bps: m!.underpaymentToleranceBps, overpayment_policy: m!.overpaymentPolicy, default_expiry_seconds: m!.defaultExpirySeconds }, user: u ? { id: u.id, email: u.email, has_real_email: !E.isPlaceholderEmail(u.email), email_verified: !E.isPlaceholderEmail(u.email) && !!u.emailVerifiedAt, role: u.role } : null, role: a.role, environment: a.environment, via: a.via };
      },
    }),

    // ------------------------------------------------------------------ payment intents
    route({
      method: "POST", path: "/v1/payment-intents", tag: "Payments", summary: "Create a payment intent", auth: "merchant", body: createPaymentIntentSchema, idempotent: true, successStatus: 201,
      description: "Returns the hosted checkout URL and, per network, a unique counterfactual USDC deposit address. Use `Idempotency-Key` to make retries safe.",
      handler: async ({ body, auth }) => E.createPaymentIntent(e, A(auth), body),
    }),
    route({
      method: "GET", path: "/v1/payment-intents/:id", tag: "Payments", summary: "Retrieve a payment intent", auth: "merchant",
      handler: async ({ params, auth }) => E.getPaymentIntent(e, A(auth), params.id!),
    }),
    route({
      method: "GET", path: "/v1/payments", tag: "Payments", summary: "List and search payments", auth: "merchant",
      query: z.object({ status: z.string().optional(), q: z.string().max(100).optional(), network: z.string().optional(), from: z.string().datetime().optional(), to: z.string().datetime().optional(), limit: limitQ, cursor: z.string().datetime().optional() }),
      handler: async ({ query, auth }) => {
        const r = await E.listPayments(e, A(auth), { status: query.status?.split(",").filter(Boolean), q: query.q, network: query.network, from: query.from ? new Date(query.from) : undefined, to: query.to ? new Date(query.to) : undefined, limit: query.limit, cursor: query.cursor });
        return { object: "list", ...r };
      },
    }),
    route({
      method: "GET", path: "/v1/payments/:id", tag: "Payments", summary: "Payment detail with timeline, transfers, settlements and attempts", auth: "merchant",
      handler: async ({ params, auth }) => E.paymentDetail(e, A(auth), params.id!),
    }),

    // ------------------------------------------------------------------ payment links
    route({
      method: "POST", path: "/v1/payment-links", tag: "Payment links", summary: "Create a reusable payment link", auth: "merchant", body: createPaymentLinkSchema, idempotent: true, successStatus: 201,
      handler: async ({ body, auth }) => E.createPaymentLink(e, A(auth), body),
    }),
    route({ method: "GET", path: "/v1/payment-links", tag: "Payment links", summary: "List payment links", auth: "merchant", handler: async ({ auth }) => list(await E.listPaymentLinks(e, A(auth))) }),
    route({ method: "GET", path: "/v1/payment-links/:id", tag: "Payment links", summary: "Retrieve a payment link", auth: "merchant", handler: async ({ params, auth }) => E.getPaymentLink(e, A(auth), params.id!) }),
    route({
      method: "PATCH", path: "/v1/payment-links/:id", tag: "Payment links", summary: "Activate or deactivate a payment link", auth: "merchant", body: z.object({ active: z.boolean() }),
      handler: async ({ params, body, auth }) => E.setPaymentLinkActive(e, A(auth), params.id!, body.active),
    }),

    // ------------------------------------------------------------------ invoices
    route({
      method: "POST", path: "/v1/invoices", tag: "Invoices", summary: "Create an invoice", auth: "merchant", body: createInvoiceSchema, idempotent: true, successStatus: 201,
      handler: async ({ body, auth }) => E.createInvoice(e, A(auth), body),
    }),
    route({ method: "GET", path: "/v1/invoices", tag: "Invoices", summary: "List invoices", auth: "merchant", handler: async ({ auth }) => list(await E.listInvoices(e, A(auth))) }),
    route({ method: "GET", path: "/v1/invoices/:id", tag: "Invoices", summary: "Retrieve an invoice", auth: "merchant", handler: async ({ params, auth }) => E.getInvoice(e, A(auth), params.id!) }),

    // ------------------------------------------------------------------ networks, assets, ledger views
    route({ method: "GET", path: "/v1/networks", tag: "Networks", summary: "Supported networks, capabilities and your vault status", auth: "merchant", handler: async ({ auth }) => list(await E.listNetworks(e, A(auth))) }),
    route({
      method: "GET", path: "/v1/assets", tag: "Networks", summary: "Official assets accepted per network", auth: "merchant",
      description: "Only the official, Circle-issued native USDC contract of each network is accepted. Bridged variants are not.",
      handler: async () => list([...e.chains.values()].map((c) => ({ network: c.network.id, symbol: "USDC", address: c.network.usdc.address, decimals: 6, official: true, receive_with_authorization: c.network.authorization.receiveWithAuthorization, authorization_verified_at: c.network.authorization.verifiedAt }))),
    }),
    route({
      method: "GET", path: "/v1/transactions", tag: "Ledger", summary: "On-chain movements observed for your payments", auth: "merchant", query: z.object({ limit: limitQ }),
      handler: async ({ query, auth }) => list(await E.listTransactions(e, A(auth), query.limit)),
    }),
    route({
      method: "GET", path: "/v1/settlements", tag: "Ledger", summary: "Settlements into your vault", auth: "merchant", query: z.object({ limit: limitQ }),
      handler: async ({ query, auth }) => list(await E.listSettlements(e, A(auth), query.limit)),
    }),
    route({ method: "GET", path: "/v1/overview", tag: "Ledger", summary: "Dashboard metrics (received vs settled are labelled separately)", auth: "merchant", query: z.object({ days: z.coerce.number().int().min(1).max(365).optional(), currency: z.enum(TOKEN_SYMBOLS).optional() }), handler: async ({ query, auth }) => E.overview(e, A(auth), query.days, query.currency) }),
    route({ method: "GET", path: "/v1/audit-events", tag: "Ledger", summary: "Audit log", auth: "merchant", query: z.object({ limit: limitQ }), handler: async ({ query, auth }) => { const a = A(auth); E.requirePermission(a, "developers"); return list(await E.listAudit(e, a, query.limit)); } }),

    // ------------------------------------------------------------------ refunds
    route({
      method: "POST", path: "/v1/refund-requests", tag: "Refunds", summary: "Request a refund", auth: "merchant", body: createRefundRequestSchema, idempotent: true, successStatus: 201,
      description: "A refund is a NEW transfer from your vault, sent by you. It completes only after that transfer is verified on-chain (see proof).",
      handler: async ({ body, auth }) => E.requestRefund(e, A(auth), body),
    }),
    route({ method: "GET", path: "/v1/refund-requests", tag: "Refunds", summary: "List refund requests", auth: "merchant", handler: async ({ auth }) => list(await E.listRefunds(e, A(auth))) }),
    route({ method: "GET", path: "/v1/refund-requests/:id", tag: "Refunds", summary: "Retrieve a refund request", auth: "merchant", handler: async ({ params, auth }) => E.getRefund(e, A(auth), params.id!) }),
    route({
      method: "POST", path: "/v1/refund-requests/:id/proof", tag: "Refunds", summary: "Submit the vault→recipient transaction that fulfils a refund", auth: "merchant", body: submitRefundProofSchema,
      handler: async ({ params, body, auth }) => E.submitRefundProof(e, A(auth), params.id!, body.tx_hash as Hex),
    }),
    route({ method: "POST", path: "/v1/refund-requests/:id/reject", tag: "Refunds", summary: "Reject an open refund request", auth: "merchant", handler: async ({ params, auth }) => E.rejectRefund(e, A(auth), params.id!) }),

    // ------------------------------------------------------------------ webhooks
    route({
      method: "POST", path: "/v1/webhook-endpoints", tag: "Webhooks", summary: "Create a webhook endpoint", auth: "merchant", body: createWebhookEndpointSchema, successStatus: 201,
      description: `The signing secret is returned once. Events: ${WEBHOOK_EVENT_TYPES.join(", ")}.`,
      handler: async ({ body, auth }) => { const a = A(auth); E.requirePermission(a, "developers"); return E.createEndpoint(e, a.merchantId, a.environment, body); },
    }),
    route({ method: "GET", path: "/v1/webhook-endpoints", tag: "Webhooks", summary: "List webhook endpoints", auth: "merchant", handler: async ({ auth }) => list(await E.listWebhookEndpoints(e, A(auth))) }),
    route({
      method: "DELETE", path: "/v1/webhook-endpoints/:id", tag: "Webhooks", summary: "Disable a webhook endpoint", auth: "merchant",
      handler: async ({ params, auth }) => {
        const a = A(auth); E.requirePermission(a, "developers");
        const r = await e.db.update(schema.webhookEndpoints).set({ status: "DISABLED", disabledReason: "deleted by user" }).where(and(eq(schema.webhookEndpoints.id, params.id!), eq(schema.webhookEndpoints.merchantId, a.merchantId))).returning({ id: schema.webhookEndpoints.id });
        if (!r.length) throw new E.EngineError("NOT_FOUND", "Endpoint not found", 404);
        await E.audit(e.db, { merchantId: a.merchantId, actor: a.actor, action: "webhook_endpoint.disabled", targetType: "webhook_endpoint", targetId: params.id });
        return { id: params.id, status: "DISABLED" };
      },
    }),
    route({ method: "GET", path: "/v1/webhook-deliveries", tag: "Webhooks", summary: "Delivery log (every attempt is recorded)", auth: "merchant", query: z.object({ limit: limitQ }), handler: async ({ query, auth }) => list((await E.listDeliveries(e.db, A(auth).merchantId, query.limit)).map((d) => ({ ...d, lastAttemptAt: d.lastAttemptAt?.toISOString() ?? null, nextAttemptAt: d.nextAttemptAt?.toISOString() ?? null, createdAt: d.createdAt.toISOString() }))) }),
    route({
      method: "GET", path: "/v1/webhook-deliveries/:id/attempts", tag: "Webhooks", summary: "Attempts for one delivery", auth: "merchant",
      handler: async ({ params, auth }) => {
        const [d] = await e.db.select().from(schema.webhookDeliveries).where(and(eq(schema.webhookDeliveries.id, params.id!), eq(schema.webhookDeliveries.merchantId, A(auth).merchantId)));
        if (!d) throw new E.EngineError("NOT_FOUND", "Delivery not found", 404);
        const rows = await e.db.select().from(schema.webhookAttempts).where(eq(schema.webhookAttempts.deliveryId, d.id));
        return list(rows.map((r) => ({ attempt: r.attemptNumber, status_code: r.statusCode, error: r.error, duration_ms: r.durationMs, response_snippet: r.responseSnippet, at: r.attemptedAt.toISOString() })));
      },
    }),
    route({
      method: "POST", path: "/v1/webhook-deliveries/:id/retry", tag: "Webhooks", summary: "Retry a failed or abandoned delivery", auth: "merchant",
      handler: async ({ params, auth }) => { const a = A(auth); E.requirePermission(a, "developers"); await E.retryDelivery(e, a.merchantId, params.id!); return { id: params.id, status: "RETRYING" }; },
    }),

    // ------------------------------------------------------------------ payout methods
    route({
      method: "GET", path: "/v1/payout-methods", tag: "Payout methods", summary: "How you are paid on each network", auth: "merchant",
      description: "Per network: the mode in use (`VAULT` or `DIRECT`), where the money goes, the platform fee and treasury, the vault, and any change that is waiting for its email link or its cooldown.",
      handler: async ({ auth }) => list(await E.listPayoutMethods(e, A(auth))),
    }),
    route({
      method: "GET", path: "/v1/payout-methods/history", tag: "Payout methods", summary: "Every payout change you requested", auth: "merchant", query: z.object({ limit: limitQ }),
      handler: async ({ auth, query }) => list(await E.listPayoutHistory(e, A(auth), query.limit)),
    }),
    route({
      method: "POST", path: "/v1/payout-methods/challenge", tag: "Payout methods", summary: "Get the message a wallet must sign to prove control", auth: "session", body: payoutChallengeSchema, rateLimit: 20,
      description: "Returns a Sign-In with Ethereum (EIP-4361) message that expires in ten minutes. The wallet signs it with `personal_sign`; the signature is single use. Plain wallets (EOAs) only; smart-contract wallets are not supported in this version.",
      handler: async ({ auth, body }) => E.createPayoutChallenge(e, A(auth), body),
    }),
    route({
      method: "POST", path: "/v1/payout-methods/wallet", tag: "Payout methods", summary: "Ask to be paid directly to your own wallet", auth: "session", body: payoutWalletSchema, rateLimit: 10, successStatus: 201,
      description: "Needs a verified email, the signed challenge, and a fresh sign-in (`reauth`). The change only starts after you open the link emailed to you, plus the cooldown. Invoices that already have an address keep the destination they were issued with.",
      handler: async ({ auth, body }) => E.requestPayoutWallet(e, A(auth), body),
    }),
    route({
      method: "POST", path: "/v1/payout-methods/vault", tag: "Payout methods", summary: "Go back to being paid into your vault", auth: "session", body: payoutVaultSchema, rateLimit: 10,
      description: "Applies immediately to new invoices. Needs a fresh sign-in.",
      handler: async ({ auth, body }) => E.switchToVault(e, A(auth), body),
    }),
    route({
      method: "POST", path: "/v1/payout-methods/:id/cancel", tag: "Payout methods", summary: "Cancel a pending or cooling-down payout change", auth: "session",
      handler: async ({ auth, params }) => E.cancelPendingPayout(e, A(auth), { id: params.id! }),
    }),
    route({
      method: "POST", path: "/public/payout/confirm", tag: "Payout methods", summary: "Use the link from a payout confirmation email", auth: "none", body: payoutConfirmSchema, rateLimit: 20,
      description: "Single use. The web app opens this from `/confirm-payout?token=…`. Starts the cooldown.",
      handler: async ({ body }) => E.confirmPayoutLink(e, body.token),
    }),

    // ------------------------------------------------------------------ custody (custodial payouts)
    route({
      method: "GET", path: "/v1/custody", tag: "Custody", summary: "Custody balances per network and token, and where they can be withdrawn", auth: "merchant",
      description: "Only meaningful for merchants in the custodial payout mode, where the platform holds the balance. `available` is false on networks where custody is switched off. Amounts are in each token's own units; they are never added across tokens.",
      handler: async ({ auth }) => list(await E.listCustody(e, A(auth))),
    }),
    route({
      method: "POST", path: "/v1/custody/withdrawals", tag: "Custody", summary: "Withdraw your custody balance to your proven withdrawal wallet", auth: "session", body: custodyWithdrawalSchema, rateLimit: 10, successStatus: 201,
      description: "Needs a fresh sign-in (`reauth`). Send an `Idempotency-Key` header: repeating the same key returns the same withdrawal. Omit `amount` to withdraw everything. The destination is never chosen in the request: it is the withdrawal wallet you proved and confirmed by email.",
      handler: async ({ auth, body, req }) => E.requestWithdrawal(e, A(auth), { ...body, idempotencyKey: typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"] : undefined }),
    }),
    route({
      method: "GET", path: "/v1/custody/withdrawals", tag: "Custody", summary: "Your custody withdrawals", auth: "merchant", query: z.object({ limit: limitQ }),
      handler: async ({ auth, query }) => list(await E.listWithdrawals(e, A(auth), query.limit)),
    }),
    route({
      method: "PATCH", path: "/v1/custody/schedule", tag: "Custody", summary: "Set automatic payouts of a custody balance", auth: "session", body: custodyScheduleSchema.extend({ reauth: reauthSchema }), rateLimit: 10,
      description: "MANUAL, DAILY or WEEKLY. A scheduled payout sends the whole balance in one transfer, only when it is at least `min_amount`, and needs a confirmed withdrawal wallet.",
      handler: async ({ auth, body }) => E.setCustodySchedule(e, A(auth), body),
    }),

    // ------------------------------------------------------------------ vaults & settlement policy
    route({
      method: "POST", path: "/v1/vaults", tag: "Vaults & settlement", summary: "Enable a network: create your settlement vault", auth: "merchant", body: enableNetworkSchema, idempotent: true, successStatus: 201,
      description: "`owner_address` becomes the sole owner of the vault. Use a multisig. The gateway never holds an administrative role.",
      handler: async ({ body, auth }) => E.enableNetwork(e, A(auth), body),
    }),
    route({ method: "GET", path: "/v1/vaults/:network", tag: "Vaults & settlement", summary: "Live on-chain vault state (owner, policy, balance)", auth: "merchant", query: z.object({ token: z.enum(TOKEN_SYMBOLS).optional() }), handler: async ({ params, query, auth }) => E.readVaultState(e, A(auth), params.network!, query.token) }),
    route({ method: "POST", path: "/v1/vaults/:network/confirm", tag: "Vaults & settlement", summary: "Re-check an externally deployed vault on-chain", auth: "merchant", query: z.object({ token: z.enum(TOKEN_SYMBOLS).optional() }), handler: async ({ params, query, auth }) => E.confirmVault(e, A(auth), params.network!, query.token) }),
    route({
      method: "POST", path: "/v1/vaults/:network/settlement-tx", tag: "Vaults & settlement", summary: "Build the transaction that changes your on-chain settlement policy", auth: "merchant",
      query: z.object({ token: z.enum(TOKEN_SYMBOLS).optional() }), 
      body: z.object({ mode: z.enum(["BALANCE_IN_VAULT", "INSTANT_FORWARD", "THRESHOLD_OR_PERIODIC"]), destination: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(), threshold_units: z.string().regex(/^\d+$/).optional(), interval_seconds: z.number().int().min(0).max(31536000).optional() }),
      description: "Returns calldata only. Sign and send it from the vault owner wallet; the gateway cannot execute it.",
      handler: async ({ params, query, body, auth }) => {
        const a = A(auth); E.requirePermission(a, "wallets");
        const [v] = await e.db.select().from(schema.merchantVaults).where(and(eq(schema.merchantVaults.merchantId, a.merchantId), eq(schema.merchantVaults.networkId, params.network!), eq(schema.merchantVaults.tokenSymbol, query.token ?? "USDC")));
        if (!v) throw new E.EngineError("NOT_FOUND", "No vault for this network", 404);
        const c = E.chainOf(e, params.network!);
        return { chain_id: c.network.chainId, ...E.buildSettlementPolicyTx(e, getAddress(v.vaultAddress), body) };
      },
    }),
    route({
      method: "GET", path: "/v1/settlement-policy", tag: "Vaults & settlement", summary: "Accounting policy and per-network vault policies", auth: "merchant",
      handler: async ({ auth }) => {
        const a = A(auth);
        const [m] = await e.db.select().from(schema.merchants).where(eq(schema.merchants.id, a.merchantId));
        const vaults = await e.db.select().from(schema.merchantVaults).where(eq(schema.merchantVaults.merchantId, a.merchantId));
        const onchain = [];
        for (const v of vaults) onchain.push(await E.readVaultState(e, a, v.networkId, v.tokenSymbol as TokenSymbol).catch(() => ({ network: v.networkId, token: v.tokenSymbol, onchain: null })));
        return { accounting: { underpayment_tolerance_bps: m!.underpaymentToleranceBps, overpayment_policy: m!.overpaymentPolicy, default_expiry_seconds: m!.defaultExpirySeconds }, vaults: onchain };
      },
    }),
    route({
      method: "PATCH", path: "/v1/settlement-policy", tag: "Vaults & settlement", summary: "Update accounting policy (underpayment tolerance, expiry)", auth: "merchant",
      body: z.object({ name: z.string().min(2).max(120).optional(), underpayment_tolerance_bps: z.number().int().min(0).max(1000).optional(), overpayment_policy: z.enum(["ACCEPT", "FLAG"]).optional(), default_expiry_seconds: z.number().int().min(300).max(2592000).optional() }),
      handler: async ({ body, auth }) => E.updateMerchantSettings(e, A(auth), body),
    }),

    // ------------------------------------------------------------------ API keys
    route({ method: "GET", path: "/v1/api-keys", tag: "API keys", summary: "List API keys (secrets are never shown again)", auth: "merchant", handler: async ({ auth }) => list(await E.listApiKeys(e, A(auth))) }),
    route({ method: "POST", path: "/v1/api-keys", tag: "API keys", summary: "Create an API key", auth: "session", body: createApiKeySchema, successStatus: 201, description: "The full key is returned exactly once.", handler: async ({ body, auth }) => E.createApiKey(e, A(auth), body) }),
    route({ method: "POST", path: "/v1/api-keys/:id/rotate", tag: "API keys", summary: "Rotate a key (new key issued, old key revoked)", auth: "session", handler: async ({ params, auth }) => E.rotateApiKey(e, A(auth), params.id!) }),
    route({ method: "DELETE", path: "/v1/api-keys/:id", tag: "API keys", summary: "Revoke an API key", auth: "session", handler: async ({ params, auth }) => { await E.revokeApiKey(e, A(auth), params.id!); return { id: params.id, revoked: true }; } }),

    // ------------------------------------------------------------------ team
    route({ method: "GET", path: "/v1/team", tag: "Team", summary: "List team members", auth: "session", handler: async ({ auth }) => list(await E.listTeam(e, A(auth))) }),
    route({ method: "POST", path: "/v1/team", tag: "Team", summary: "Add a team member", auth: "session", body: teamAddSchema, rateLimit: 10, successStatus: 201, description: "Needs a fresh sign-in (`reauth`). Every owner and admin with a verified email is told. The returned temporary password is shown once.", handler: async ({ body, auth }) => E.addTeamMember(e, A(auth), body) }),
    route({ method: "PATCH", path: "/v1/team/:id", tag: "Team", summary: "Change a member's role", auth: "session", body: teamRoleSchema, rateLimit: 10, description: "Needs a fresh sign-in (`reauth`).", handler: async ({ params, body, auth }) => { await E.setMemberRole(e, A(auth), params.id!, body.role, body.reauth); return { id: params.id, role: body.role }; } }),
    route({ method: "POST", path: "/v1/team/:id/remove", tag: "Team", summary: "Remove a team member", auth: "session", body: teamRemoveSchema, rateLimit: 10, description: "Needs a fresh sign-in (`reauth`). The member's sessions end at once.", handler: async ({ params, body, auth }) => E.removeTeamMember(e, A(auth), params.id!, body.reauth) }),

    // ------------------------------------------------------------------ public checkout (capability URL)
    route({ method: "GET", path: "/public/checkout/:id", tag: "Checkout", summary: "Hosted-checkout data for a payment", auth: "none", rateLimit: 240, handler: async ({ params }) => E.publicCheckout(e, params.id!) }),
    route({
      method: "POST", path: "/public/checkout/:id/wallet/prepare", tag: "Checkout", summary: "Prepare a gasless EIP-3009 authorization for the paying wallet", auth: "none", body: walletPrepareSchema, rateLimit: 30,
      handler: async ({ params, body }) => E.prepareWalletPayment(e, params.id!, body),
    }),
    route({
      method: "POST", path: "/public/checkout/:id/wallet/submit", tag: "Checkout", summary: "Submit the signed authorization for relaying", auth: "none", body: walletSubmitSchema, rateLimit: 30,
      description: "The signature is validated against the exact payload issued by `prepare`. Treat signatures as sensitive: they are never logged.",
      handler: async ({ params, body }) => E.submitWalletPayment(e, params.id!, body),
    }),
    route({ method: "GET", path: "/public/checkout/:id/wallet/attempts/:attemptId", tag: "Checkout", summary: "Poll a wallet payment attempt", auth: "none", rateLimit: 240, handler: async ({ params }) => E.attemptStatus(e, params.id!, params.attemptId!) }),
    route({ method: "GET", path: "/public/links/:slug", tag: "Checkout", summary: "Public payment-link details", auth: "none", rateLimit: 120, handler: async ({ params }) => E.publicLinkInfo(e, params.slug!) }),
    route({ method: "POST", path: "/public/links/:slug/checkout", tag: "Checkout", summary: "Open a payment link: creates a fresh payment", auth: "none", rateLimit: 20, successStatus: 201, handler: async ({ params }) => E.createIntentFromLink(e, params.slug!) }),

    // ------------------------------------------------------------------ operator
    route({
      method: "POST", path: "/admin/merchants/:id/fee", tag: "Operator", summary: "Set or clear one merchant's platform fee", auth: "admin", body: merchantFeeSchema,
      description: "Basis points, 0 to 100 (the on-chain cap). `null` returns the merchant to the platform default. Applies to invoices created afterwards.",
      handler: async ({ params, body }) => E.setMerchantFee(e, params.id!, body.fee_bps, { id: "admin" }),
    }),
    route({ method: "GET", path: "/admin/relayer", tag: "Operator", summary: "Relayer queue, balances and spend per network", auth: "admin", handler: async () => list(await E.relayerStatus(e)) }),
    route({
      method: "POST", path: "/admin/relayer/:network/pause", tag: "Operator", summary: "Emergency stop: disable NEW relayer actions", auth: "admin", body: z.object({ reason: z.string().min(3).max(300) }),
      handler: async ({ params, body }) => { await E.setPaused(e, params.network!, true, body.reason, { id: "admin" }); return { network: params.network, paused: true }; },
    }),
    route({ method: "POST", path: "/admin/relayer/:network/resume", tag: "Operator", summary: "Resume relayer actions", auth: "admin", handler: async ({ params }) => { await E.setPaused(e, params.network!, false, undefined, { id: "admin" }); return { network: params.network, paused: false }; } }),
  ];
}

void txHashSchema; void selectAddressNetworkSchema; void id;
