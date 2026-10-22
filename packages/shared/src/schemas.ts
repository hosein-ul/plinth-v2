import { z } from "zod";
import { TOKEN_SYMBOLS } from "./networks";

export const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Invalid EVM address");
export const txHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Invalid transaction hash");
/** Validated against the runtime network list by the API (built-ins plus optional local-dev). */
export const networkIdSchema = z.string().regex(/^[a-z0-9-]{2,40}$/);

/** Money crosses the API as a decimal string in USDC units ("12.50"); storage is integer base units. */
export const usdcAmountSchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,6})?$/, "Amount must be a decimal string with up to 6 decimals")
  .refine((s) => Number(s) > 0, "Amount must be greater than zero");

export const checkoutMethodSchema = z.enum(["WALLET", "ADDRESS"]);
export type CheckoutMethod = z.infer<typeof checkoutMethodSchema>;

/** Platform default for how long a payment intent stays payable: 20 minutes. */
export const DEFAULT_EXPIRY_SECONDS = 20 * 60;

/** Where the customer is sent after checkout: https only (plain http only for a local machine). Never javascript:, data: or other schemes. */
export const redirectUrlSchema = z
  .string()
  .url()
  .max(2000)
  .refine((u) => /^https:\/\//i.test(u) || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(u), "Must be an https:// URL");

export const createPaymentIntentSchema = z.object({
  amount: usdcAmountSchema,
  /** The token the payment is denominated and paid in. Default USDC. */
  currency: z.enum(TOKEN_SYMBOLS).default("USDC"),
  order_reference: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  networks: z.array(networkIdSchema).min(1).max(8).optional(),
  checkout_methods: z.array(checkoutMethodSchema).min(1).default(["WALLET", "ADDRESS"]),
  // No schema default on purpose: when omitted, the engine uses the merchant's default expiry setting
  // (which starts at DEFAULT_EXPIRY_SECONDS), so the per-merchant override actually applies.
  expires_in_seconds: z.number().int().min(300).max(60 * 60 * 24 * 30).optional().describe("Seconds the payment stays payable (300 to 2592000). Omit to use the merchant's default expiry, which is 1200 (20 minutes) unless changed in settings."),
  customer_email: z.string().email().max(320).optional(),
  success_url: redirectUrlSchema.optional(),
  cancel_url: redirectUrlSchema.optional(),
  metadata: z.record(z.string().max(40), z.string().max(500)).refine((m) => Object.keys(m).length <= 20).optional(),
});
export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;

export const createPaymentLinkSchema = z.object({
  name: z.string().min(1).max(120),
  amount: usdcAmountSchema,
  currency: z.enum(TOKEN_SYMBOLS).default("USDC").describe("The token the link is paid in. USDC everywhere; EURC where the network supports it."),
  description: z.string().max(500).optional(),
  networks: z.array(networkIdSchema).min(1).optional(),
  checkout_methods: z.array(checkoutMethodSchema).min(1).default(["WALLET", "ADDRESS"]),
  success_url: redirectUrlSchema.optional(),
  intent_expires_in_seconds: z.number().int().min(300).max(60 * 60 * 24 * 7).default(DEFAULT_EXPIRY_SECONDS),
});

export const createInvoiceSchema = z.object({
  customer_name: z.string().min(1).max(200),
  customer_email: z.string().email().max(320),
  memo: z.string().max(1000).optional(),
  due_in_days: z.number().int().min(1).max(90).default(14),
  currency: z.enum(TOKEN_SYMBOLS).default("USDC").describe("The token the invoice is paid in. Line item amounts are in this token."),
  line_items: z
    .array(
      z.object({
        description: z.string().min(1).max(300),
        quantity: z.number().int().min(1).max(100000).default(1),
        unit_amount: usdcAmountSchema,
      }),
    )
    .min(1)
    .max(100),
  networks: z.array(networkIdSchema).min(1).optional(),
  checkout_methods: z.array(checkoutMethodSchema).min(1).default(["WALLET", "ADDRESS"]),
});

export const settlementPolicySchema = z.object({
  /** Mirrors the on-chain mode. The authoritative value is the vault; this is the cached view. */
  underpayment_tolerance_bps: z.number().int().min(0).max(1000).default(0),
});

export const createWebhookEndpointSchema = z.object({
  url: z.string().url().max(2000),
  description: z.string().max(200).optional(),
  events: z.array(z.string()).min(1).default(["*"]),
});

export const createRefundRequestSchema = z.object({
  payment_intent_id: z.string().min(1),
  amount: usdcAmountSchema,
  recipient: addressSchema,
  reason: z.string().max(500).optional(),
});

export const submitRefundProofSchema = z.object({ tx_hash: txHashSchema });

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(80),
  environment: z.enum(["test", "live"]),
});

export const enableNetworkSchema = z.object({
  network: networkIdSchema,
  /** Which token this vault holds. One vault per merchant, network and token. */
  token: z.enum(TOKEN_SYMBOLS).default("USDC"),
  /** The merchant's own address that will own the vault (use a multisig in production). */
  owner_address: addressSchema,
  /** Proof that the owner wallet signed the challenge from POST /v1/payout-methods/challenge (purpose VAULT_OWNER). Required in production. */
  proof: z.object({ nonce: z.string().min(16).max(64), signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/, "Expected a 65-byte hex signature") }).optional(),
});

export const signupSchema = z.object({
  business_name: z.string().min(2).max(120),
  email: z.string().email().max(320),
  password: z.string().min(12).max(200),
});
export const circleOtpSchema = z.object({ device_id: z.string().min(8).max(200), email: z.string().trim().toLowerCase().email().max(254) });
export const circleSignInSchema = z.object({ user_token: z.string().min(20).max(8000), business_name: z.string().trim().min(1).max(120).optional() });
export const web3authSchema = z.object({ id_token: z.string().min(20).max(8000), business_name: z.string().trim().min(1).max(120).optional() });
/** Proof that the person at the keyboard owns the account right now: a password, or a fresh sign-in identity token. */
export const reauthSchema = z
  .object({ password: z.string().min(1).max(200).optional(), id_token: z.string().min(20).max(8000).optional() })
  .refine((r) => !!r.password || !!r.id_token, "Provide the password, or a fresh sign-in token");
const signatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/, "Expected a 65-byte hex signature");
export const payoutChallengeSchema = z.object({ network: networkIdSchema, address: addressSchema, purpose: z.enum(["PAYOUT_WALLET", "VAULT_OWNER", "CUSTODY_WITHDRAWAL"]) });
/**
 * `mode` DIRECT pays each payment straight to `address` (non-custodial). CUSTODIAL pays into the platform's custody wallet
 * and `address` is the withdrawal wallet the balance can be sent to; the challenge for it has purpose CUSTODY_WITHDRAWAL.
 */
export const payoutWalletSchema = z.object({ network: networkIdSchema, mode: z.enum(["DIRECT", "CUSTODIAL"]).default("DIRECT"), address: addressSchema, nonce: z.string().min(16).max(64), signature: signatureSchema, reauth: reauthSchema });
export const payoutVaultSchema = z.object({ network: networkIdSchema, reauth: reauthSchema });
export const payoutConfirmSchema = z.object({ token: z.string().min(20).max(200) });
export const merchantFeeSchema = z.object({ fee_bps: z.number().int().min(0).max(100).nullable() });
export const emailChangeSchema = z.object({ email: z.string().trim().email().max(320), reauth: reauthSchema });
export const emailConfirmSchema = z.object({ token: z.string().min(20).max(200) });
const roleSchema = z.enum(["OWNER", "ADMIN", "DEVELOPER", "VIEWER"]);
/** Team changes decide who can later move money, so each one needs the acting person's fresh sign-in. */
export const teamAddSchema = z.object({ email: z.string().trim().email().max(320), role: roleSchema, reauth: reauthSchema });
export const teamRoleSchema = z.object({ role: roleSchema, reauth: reauthSchema });
export const teamRemoveSchema = z.object({ reauth: reauthSchema });
export const passwordChangeSchema = z.object({ current_password: z.string().min(1).max(200), new_password: z.string().min(12).max(200) });
export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });

export const WEBHOOK_EVENT_TYPES = [
  "payment.detected",
  "payment.confirmed",
  "payment.completed",
  "payment.underpaid",
  "payment.overpaid",
  "payment.expired",
  "payment.late",
  "payment.invalid_asset",
  "settlement.submitted",
  "settlement.completed",
  "settlement.failed",
  "refund.requested",
  "refund.completed",
  "payout.requested",
  "payout.confirmed",
  "payout.switched_to_vault",
  "payout.cancelled",
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const walletPrepareSchema = z.object({ network: networkIdSchema, payer: addressSchema });
export const walletSubmitSchema = z.object({
  attempt_id: z.string().min(1),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/, "Expected a 65-byte hex signature"),
});
export const selectAddressNetworkSchema = z.object({ network: networkIdSchema });

export const custodyWithdrawalSchema = z.object({
  network: networkIdSchema,
  token: z.enum(TOKEN_SYMBOLS).default("USDC"),
  /** Decimal amount in the token, or omit to withdraw the whole balance. */
  amount: usdcAmountSchema.optional(),
  reauth: reauthSchema,
});

export const custodyScheduleSchema = z.object({
  network: networkIdSchema,
  token: z.enum(TOKEN_SYMBOLS).default("USDC"),
  schedule: z.enum(["MANUAL", "DAILY", "WEEKLY"]),
  /** A scheduled payout only runs when the balance is at least this much (decimal string in the token). */
  min_amount: z.string().regex(/^\d{1,12}(\.\d{1,6})?$/, "Amount must be a decimal string with up to 6 decimals").default("0"),
});
