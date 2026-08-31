# Verified Trucks

GitHub: https://github.com/mdevarajofficial-svg/verifiedtrucks.com  
Live: https://verifiedtrucks-20.web.app  

A single-file freight marketplace backed by **Cloud Firestore** (Firebase). Post loads to Live Loads, place bids, share on WhatsApp, and manage bookings from VIP Access. Data syncs in real time across browsers.

## Features

- **Login** — Phone OTP, Google, Apple, or email/password. Profiles store Full Name, contact, and role (Transporter with optional GSTIN, or Vehicle/Fleet owner with Driving Licence, vehicle size, and current city)
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

### Authentication

These sign-in methods are enabled on the Firebase project:

- Email / password
- Phone (SMS OTP)
- Google
- Apple (provider is on; complete Apple Developer IDs in Console)

Authorized domains include `verifiedtrucks.com`, `verifiedtrucks-20.web.app`, `verifiedtrucks-20.firebaseapp.com`, and `127.0.0.1`. Firebase does **not** allow phone auth on the hostname `localhost` — use `127.0.0.1` or the live site.

Phone SMS uses `signInWithPhoneNumber` then `confirmationResult.confirm(code)`. Live SMS to real numbers needs a paid (Blaze) Firebase billing account.

**Test numbers** (no SMS, no billing): `+16505553434` code `654321`, or `+16505550123` code `123456`.

Apple Sign-In on the web needs an Apple Service ID, Team ID, and key in [Firebase Console → Authentication → Sign-in method → Apple](https://console.firebase.google.com/project/verifiedtrucks-20/authentication/providers).

```bash
npx firebase-tools deploy --only auth --project verifiedtrucks-20
```

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
