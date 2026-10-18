# Verified Trucks

GitHub: https://github.com/mdevarajofficial-svg/verifiedtrucks.com  
Live: https://verifiedtrucks.com  
Firebase default URLs (`verifiedtrucks-20.web.app` and `verifiedtrucks-20.firebaseapp.com`) 301-redirect to https://verifiedtrucks.com, except `/__/` Auth handler paths which must stay on Firebase. The .com hostname is served by Hostinger. Google login uses `authDomain` `verifiedtrucks-20.firebaseapp.com`; add `verifiedtrucks.com` under Authentication → Settings → Authorized domains. Storage rules live in `storage.rules` (profile photos under `users/{uid}/`). CORS origins are listed in `storage.cors.json`. 

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

Or push to `main` — GitHub Actions deploys hosting, Firestore rules, and Storage rules automatically.

## Stack

- `index.html` + `assets/marketing.css` + `assets/lead-form.js`
- `verify-truck.html`, `about.html`, `profile.html`
- Firestore: `leads`, `loads`, `loadPrivate`, `bids`, `users`
