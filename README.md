# Verified Trucks

GitHub: https://github.com/mdevarajofficial-svg/verifiedtrucks.com  
Live (Firebase): https://verifiedtrucks-20.web.app  
Custom domain: https://verifiedtrucks.com currently points at **Hostinger**, not Firebase. Updating Firebase does not change Google search or verifiedtrucks.com until Hostinger is synced from `main`, or the domain is added in Firebase Hosting and DNS is switched. 

Each Google account sees posted loads, the lowest bid (accept/reject), a 30-minute live market, and can bid on any load except their own.

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
