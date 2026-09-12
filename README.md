# Verified Trucks

GitHub: https://github.com/mdevarajofficial-svg/verifiedtrucks.com  
Live: https://verifiedtrucks-20.web.app  

Public homepage is a single booking form: **Book truck in Just 10 Minutes**. Customers enter loading location, unloading location, size in feet, open or container, tonnage, and contact details. After submit they see that a truck will be found within 10 minutes. Leads are stored in Firestore `leads`.

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
