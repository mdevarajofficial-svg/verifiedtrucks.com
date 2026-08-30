# Verified Trucks

A single-file freight marketplace for shippers and transporters. Post loads to **Live Loads**, place bids, share on WhatsApp, and manage bookings from a password-protected VIP dashboard. All data persists in the browser via `localStorage`.

## Features

- **Live Loads** — Posted freight appears here instantly with live relative timestamps
- **Post a Load** — Origin/destination, FTL/PTL, vehicle size (7–32 ft), weight, material, loading date, distance, shipper phone
- **Bidding (Live Loads only)** — Name, contact number, bid amount (₹), and vehicle number
- **Privacy on Live Loads** — Bid amounts and phone numbers are never shown publicly
- **VIP Access** (`Deva@2001`) — Full contacts & amounts, **Mark Booked** (enter vehicle number), **Delete Post**
- **Booked vehicle privacy** — Public Live Loads show only the first 5 characters of the vehicle number and hide the last 4 as `****`
- **WhatsApp share** — One-tap share with route, vehicle size, weight, material, loading date, and “Book now if interested”

## Run locally

```bash
npm start
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

## Stack

- Single `index.html` (HTML + CSS + JavaScript)
- Tailwind CSS via CDN
- `localStorage` for persistence; VIP session in `sessionStorage`
