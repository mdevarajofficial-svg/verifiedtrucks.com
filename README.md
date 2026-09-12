# Verified Trucks

GitHub: https://github.com/mdevarajofficial-svg/verifiedtrucks.com  
Live: https://verifiedtrucks-20.web.app  

Public homepage is a single booking form: **Book truck in Just 10 Minutes**. Form on the left, matching 2D truck (open or container, by size) on the right. After submit a 10-minute stopwatch counts down. VIP (`/vip.html`, code `Deva@2001`) can mark a request booked — the timer stops on both screens, confetti plays, and the customer sees **Vehicle booked successfully**.

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
- Firestore: `leads`
