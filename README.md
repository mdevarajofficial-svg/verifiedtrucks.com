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
2. Copy your **Key ID** into `razorpay-config.json` (see file for three plan tiers).
3. **Enable UPI (required for GPay / PhonePe / Paytm):**
   - Dashboard → **Account & Settings → Payment Methods → UPI**
   - Complete KYC if the Payment Methods tab is missing
   - Ensure UPI status is **Activated** (live mode can take a few days after request)
4. Redeploy hosting. Checkout shows **Pay with UPI** first, plus cards, net banking, and wallets.

Users must save a **10-digit mobile** in My Profile — Razorpay uses it for UPI intent on phones.

> Optional: create a checkout layout in the Razorpay Dashboard and paste its Configuration ID into `checkoutConfigId` in `razorpay-config.json`.

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
