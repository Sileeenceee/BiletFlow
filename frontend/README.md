# BiletFlow frontend

Responsive React and TypeScript web client for the BiletFlow ticketing API.

## Run locally

From this directory:

```sh
npm ci
npm run dev
```

Vite proxies `/api` requests to `https://localhost:6969` by default. Set
`VITE_API_PROXY_TARGET` to override the API target, or set `VITE_API_BASE_URL`
when building a frontend that is served separately from the API.

## Week 1–8 workflows

- Public event discovery, search, event details, attendee registration, and organizer event setup.
- Ticket inventory and availability management, free checkout, pending reservations, and clearly labelled payment simulation.
- Attendee order history, ticket QR/PDF downloads, and `.ics` calendar export.
- Promo codes, shareable campaign links and QR codes, and campaign analytics.
- Organizer profile, ticket-holder and order views, and event administrator assignment.
- Responsive event-admin check-in with camera QR scanning where supported, manual code entry, attendee lookup, check-in summaries, and check-in reversal.
- Support cases, threaded replies, status updates for staff, and in-app support notifications.

The application does not collect real payments or configure real payouts.

## Checks

```sh
npm run build
npm run lint
npm run test:run
```

To run the complete app with PostgreSQL and the backend, use
`docker compose up --build` from the repository root and open
`http://localhost:8080`.
