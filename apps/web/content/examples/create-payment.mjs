// Node 18+. Run on your server, never in the browser: the secret key must stay private.
const { PLINTH_API_URL, PLINTH_SECRET_KEY } = process.env;

export async function createPayment({ orderId, total }) {
  const res = await fetch(`${PLINTH_API_URL}/v1/payment-intents`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${PLINTH_SECRET_KEY}`,
      "content-type": "application/json",
      "idempotency-key": `${orderId}-1`, // a retry returns the same payment instead of a second one
    },
    body: JSON.stringify({
      amount: total, // a string such as "25.00", computed on your server
      order_reference: orderId,
      success_url: "https://YOUR_DOMAIN/thanks",
      cancel_url: "https://YOUR_DOMAIN/cart",
    }),
  });
  if (!res.ok) throw new Error(`Plinth ${res.status}: ${await res.text()}`);
  return res.json(); // { id, status, checkout_url, networks: [...] }
}

// const payment = await createPayment({ orderId: "order-1042", total: "25.00" });
// redirect the customer to payment.checkout_url
