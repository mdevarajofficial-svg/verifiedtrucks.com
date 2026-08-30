# Verified Trucks

GitHub: https://github.com/mdevarajofficial-svg/verifiedtrucks.com  
Live: https://verifiedtrucks-20.web.app  

A single-file freight marketplace backed by **Cloud Firestore** (Firebase). Post loads to Live Loads, place bids, share on WhatsApp, and manage bookings from VIP Access. Data syncs in real time across browsers.

## Features

- **Google Sign-In profiles** — Full Name, contact, role (Transporter with optional GSTIN, or Vehicle/Fleet owner with Driving Licence, vehicle size, and current city)
- **Free to use** — Unlimited load posts, bids, and contact sharing after bid acceptance
- **Accept bids** — Transporters see the **top 3 lowest bids** and can accept the best rate
- **Phone match rule** — Post/bid contact must match My Profile number
- **Fleet matching** — Vehicle owners get matching loads by size (any route) plus browser/email alerts
- **Live Loads** — Real-time Firestore sync
- **VIP Access** (`Deva@2001`) — Full contacts & amounts, Mark Booked, Delete Post
- **WhatsApp share** · **Terms & Conditions** on every load

## Firebase

Active project: **`verifiedtrucks-20`**  
Config: `firebase-config.json` · Rules: `firestore.rules`

## Live site

**https://verifiedtrucks-20.web.app**

## Run locally

```bash
npm start
```

Open http://127.0.0.1:43123

## Deploy

```bash
npm run deploy
```

Or push to `main` — GitHub Actions deploys hosting + Firestore rules automatically.

## Stack

- `index.html` + Tailwind CDN + Firebase JS SDK
- Firestore: `loads`, `users`, `mail` (optional email queue for fleet alerts)
