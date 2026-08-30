# Verified Trucks

GitHub: https://github.com/mdevarajofficial-svg/verifiedtrucks.com  
Live: https://verifiedtrucks-20.web.app  

A single-file freight marketplace backed by **Cloud Firestore** (Firebase). Post loads to Live Loads, place bids, share on WhatsApp, and manage bookings from VIP Access. Data syncs in real time across browsers — no `localStorage`.

> Note: Structured load/bid data uses **Cloud Firestore**. Firebase Storage is for files (images/PDFs); Firestore is the correct product for this marketplace.

## Features

- **Google Sign-In profiles** — Full Name, contact, role (Transporter with optional GSTIN, or Vehicle/Fleet owner with Driving Licence). View your posted loads and bids on **My Profile**
- **Live Loads** — Real-time Firestore sync of posted freight
- **Post a Load / Bid** — Requires Google Sign-In so activity links to your profile
- **VIP Access** (`Deva@2001`) — Full contacts & amounts, Mark Booked, Delete Post
- **Booked vehicle privacy** — Public shows first 5 chars only (`TN09C****`)
- **WhatsApp share** — Route, vehicle size, weight, material, loading date

## Firebase setup

Active project: **`verifiedtrucks-20`** (Cloud Firestore collection `loads`).

## Firebase setup

1. Sign in via Firebase MCP / CLI when prompted in Cursor.
2. Config lives in `firebase-config.json` (web SDK keys).
3. Rules: `firestore.rules` · deploy with `firebase deploy --only firestore`

## Live site

**https://verifiedtrucks-20.web.app**

(also https://verifiedtrucks-20.firebaseapp.com)

## Run locally

```bash
npm start
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

## Deploy

```bash
npm run deploy
# or: firebase deploy --only hosting,firestore --project verifiedtrucks-20
```

## Stack

- Single `index.html` + Tailwind CDN + Firebase JS SDK (compat)
- Cloud Firestore collection: `loads`
- VIP UI session only in `sessionStorage`
