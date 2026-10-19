#!/usr/bin/env sh
# Create a payment for one order. PLINTH_API_URL and PLINTH_SECRET_KEY come from your environment.
curl -sS -X POST "$PLINTH_API_URL/v1/payment-intents" \
  -H "Authorization: Bearer $PLINTH_SECRET_KEY" \
  -H "Idempotency-Key: order-1042-1" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "25.00",
    "order_reference": "order-1042",
    "success_url": "https://YOUR_DOMAIN/thanks",
    "cancel_url": "https://YOUR_DOMAIN/cart"
  }'
