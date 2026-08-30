# Verified Trucks

A single-file freight marketplace for shippers and transporters. Post loads, place bids, unlock shipper contacts when a bid is accepted, and review everything from a password-protected VIP admin dashboard. All data persists in the browser via `localStorage` — no backend or login walls.

## Features

- **Post a Load** — Origin/destination, FTL/PTL, vehicle size (7–32 ft), weight, material, loading date, distance, and shipper phone
- **Live Load Board** — Filterable cards with live relative timestamps (“Just now”, “5 mins ago”, …)
- **Transporter Bidding** — Inline bids with company, phone, and amount in ₹; accept a bid to book the load
- **Private contacts** — Shipper and bidder phone numbers are never shown on the public board
- **VIP Access** — Admin table (password: `Deva@2001`) is the only place that shows shipper and bidder contact details

## Run locally

Open `index.html` in a browser, or serve it:

```bash
npm start
```

Then open [http://127.0.0.1:43123](http://127.0.0.1:43123).

Or with Python only:

```bash
python3 -m http.server 43123 --bind 127.0.0.1
```

## Stack

- Single `index.html` (HTML + CSS + JavaScript)
- Tailwind CSS via CDN
- `localStorage` for persistence; VIP session in `sessionStorage`

## Notes

- No authentication on the public marketplace — anyone can post and bid immediately
- Contact numbers are stored in localStorage but rendered only inside VIP Access
- VIP password is client-side only (suitable for demos; not production auth)
