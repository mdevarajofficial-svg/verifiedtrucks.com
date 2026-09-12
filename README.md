# Verified Trucks

GitHub: https://github.com/mdevarajofficial-svg/verifiedtrucks.com  
Live: https://verifiedtrucks-20.web.app  

Public homepage is the book-truck form plus three notes (papers, payment, help). About is `/about.html`. Transporter KYC is `/verify-truck.html`. Admins (`mdevarajofficial@gmail.com`, `mdevaraj159@gmail.com`, or phones `6363655596` / `9113265599`) see a booking dashboard on Profile after Google sign-in.

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
