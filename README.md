# Verified Trucks

GitHub: https://github.com/mdevarajofficial-svg/verifiedtrucks.com  
Live: https://verifiedtrucks-20.web.app  

Public pages capture **leads** (name, phone, role) into Firestore. The live marketplace app is at `/app.html`.

## Public pages

Same white layout on every page: sticky header, hero, lead form.

| Page | URL |
| --- | --- |
| Home | `/` |
| Loads | `/loads.html` |
| Find Loads | `/find.html` |
| Post Load | `/post.html` |
| Profile | `/profile.html` |
| VIP | `/vip.html` |
| Get started | `/lead.html` |
| Marketplace app | `/app.html` |

## Marketplace features

- **Login** — Google Sign-In. Profiles store Full Name, contact, and role (Transporter with optional GSTIN, or Vehicle/Fleet owner with Driving Licence, vehicle size, and current city)
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

The app uses **Google Sign-In** only.

Authorized domains include `verifiedtrucks.com`, `verifiedtrucks-20.web.app`, `verifiedtrucks-20.firebaseapp.com`, and `127.0.0.1`.

## Live site

**https://verifiedtrucks-20.web.app** · App: **https://verifiedtrucks-20.web.app/app.html**

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

- Marketing pages: `index.html` + `assets/marketing.css` + `assets/lead-form.js`
- Marketplace: `app.html` + Tailwind CDN + Firebase JS SDK
- Firestore: `leads`, `loads`, `users`, `mail` (optional email queue for fleet alerts)
