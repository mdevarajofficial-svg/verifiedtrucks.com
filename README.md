# Verified Trucks

GitHub: https://github.com/mdevarajofficial-svg/verifiedtrucks.com  
Live: https://verifiedtrucks-20.web.app  

Public homepage posts loads straight to Firestore (no Google, no browser storage). Verify truck shows live loads for 10 minutes so transporters can bid with phone and vehicle number. VIP (`/vip.html`, code `Deva@2001`) marks a request booked.

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

- `index.html` + `assets/marketing.css` + `assets/lead-form.js`
- `verify-truck.html`, `about.html`, `profile.html`
- Firestore: `leads`, `loads`, `loadPrivate`, `bids`, `users`
