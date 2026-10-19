# Python 3.8+, standard library only. Run on your server: the secret key must stay private.
import json, os, urllib.request

API = os.environ["PLINTH_API_URL"].rstrip("/")
KEY = os.environ["PLINTH_SECRET_KEY"]


def create_payment(order_id: str, total: str) -> dict:
    req = urllib.request.Request(
        f"{API}/v1/payment-intents",
        method="POST",
        data=json.dumps({
            "amount": total,  # a string such as "25.00", computed on your server
            "order_reference": order_id,
            "success_url": "https://YOUR_DOMAIN/thanks",
            "cancel_url": "https://YOUR_DOMAIN/cart",
        }).encode(),
        headers={
            "Authorization": f"Bearer {KEY}",
            "Content-Type": "application/json",
            "Idempotency-Key": f"{order_id}-1",  # a retry returns the same payment
        },
    )
    with urllib.request.urlopen(req) as res:
        return json.load(res)  # {"id", "status", "checkout_url", "networks": [...]}


if __name__ == "__main__":
    print(create_payment("order-1042", "25.00")["checkout_url"])
