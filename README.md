# Verified Trucks

GitHub: https://github.com/mdevarajofficial-svg/verifiedtrucks.com  
Live: https://verifiedtrucks-20.web.app  

A single-file freight marketplace backed by **Cloud Firestore** (Firebase). Post loads to Live Loads, place bids, share on WhatsApp, and manage bookings from VIP Access. Data syncs in real time across browsers.

## Features

- **Google Sign-In profiles** — Full Name, contact, role (Transporter with optional GSTIN, or Vehicle/Fleet owner with Driving Licence)
- **₹99 / month Razorpay subscription** (My Profile)
  - **Transporter:** first **2 load posts free**; from the **3rd post** pay ₹99 for 1 month unlimited posts (+ bidder contact unlocks beyond 2 free)
  - **Vehicle / Fleet owner:** **1st bid free**; from the **2nd bid** subscribe for ₹99 / month for **unlimited contacts of Accepted Bids**
- **Live Loads** — Real-time Firestore sync
- **VIP Access** (`Deva@2001`) — Full contacts & amounts, Mark Booked, Delete Post
- **WhatsApp share**

## Razorpay setup

1. Open [Razorpay Dashboard → API Keys](https://dashboard.razorpay.com/app/keys)
2. Copy your **Key ID** into `razorpay-config.json`:

```json
{
  "keyId": "rzp_live_xxxxxxxx",
  "amountInr": 99,
  "durationDays": 30
}
```

3. Redeploy hosting. Checkout runs in the browser (₹99 = 9900 paise).

> This project is on the Firebase Spark plan (no Cloud Functions billing). Payment success activates the subscription on the user profile and writes a `payments/{paymentId}` receipt. For signature verification with Key Secret, upgrade to Blaze and add Cloud Functions later.

## Firebase

Active project: **`verifiedtrucks-20`**  
Config: `firebase-config.json` · Rules: `firestore.rules`

## Live site

**https://verifiedtrucks-20.web.app**

## Run locally

```bash
npm start
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

## Deploy

```bash
npm run deploy
```

## Stack

- `index.html` + Tailwind CDN + Firebase JS SDK + Razorpay Checkout
- Firestore: `loads`, `users`, `payments`
