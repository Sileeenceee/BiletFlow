# BiletFlow
Self-Service Event Ticketing Platform for Kazakhstan

## Authorization Roles

BiletFlow uses JWT authentication and role-based authorization. Every account has one of these roles:

### Attendee

- Register and verify an email address.
- Sign in, reset a password, and view the authenticated profile.
- Browse events, register for free tickets, purchase tickets, and view orders.
- Download tickets, export event details to a calendar, and request support.
- Cannot access organizer management or platform administration endpoints.

### Organizer

- Includes all attendee account capabilities.
- Create and manage events, ticket types, inventory, attendees, and orders.
- Activate paid ticket sales and manage payout information.
- Assign event administrators and review event analytics, history, and support cases.
- Access endpoints protected by the `OrganizerOnly` policy.

### EventAdmin

- Use the event-admin mobile workflow for events assigned by an organizer.
- Scan and validate ticket QR codes and record or reverse authorized check-ins.
- Search assigned-event attendees and view check-in totals.
- Cannot manage organizer accounts, unassigned events, platform settings, or moderation.

### PlatformAdmin

- Review and moderate users, events, payments, refunds, support cases, and reports.
- Suspend users or events and manage paid-sales activation records.
- Access all organizer-authorized endpoints through the `OrganizerOnly` policy.
- Access platform administration endpoints protected by the `PlatformAdminOnly` policy.

Role assignment is controlled by the backend. Public registration can create an `Attendee` account or an `Organizer` account when organizer profile creation is requested; `EventAdmin` and `PlatformAdmin` accounts must be assigned through an administrative workflow.

## Frontend and API configuration

During local development, Vite proxies `/api` requests to `https://localhost:6969`. For a separately hosted frontend, set `VITE_API_BASE_URL` to the API origin when building the frontend, and configure the API's `Cors:AllowedOrigins` setting with the exact frontend origin(s). For example, set `Cors__AllowedOrigins__0=https://tickets.example.com` in the API environment. The API does not allow cross-origin requests unless origins are explicitly configured.

To build and run the frontend, API, and database in Docker, run `docker compose up --build` from the repository root. Open the frontend at `http://localhost:8080`; its `/api` requests are proxied to the API container.

For an existing database created with the earlier event schema, apply `backend/BiletFlow.Api/Data/Migrations/001_align_legacy_schema.sql` once before starting the API. It migrates existing event values into the current model, preserves event rows, and removes legacy-only columns.

For an existing database, also apply `backend/BiletFlow.Api/Data/Migrations/002_ticketing.sql` after migration `001` to add ticket types, inventory, orders, simulated payments, and issued tickets. A fresh database is created from the current EF Core model automatically.

Refresh tokens are stored in the existing `AuthTokens` table, so no schema migration is needed for them.

## Authentication API

- `POST /api/auth/login` returns a short-lived `accessToken` (60 minutes) and a `refreshToken` (7 days). Send the access token as `Authorization: Bearer <token>`.
- `POST /api/auth/refresh` with `{ "refreshToken": "..." }` returns a new access/refresh pair and invalidates the refresh token that was sent. Role, suspension, and email-verification status are read from the database at this point, so the new access token is current. A refresh token that was already used, expired, or revoked gets `401`; presenting an already-used one also ends every refresh session of that user, because it means the token was copied.
- `POST /api/auth/logout` with `{ "refreshToken": "..." }` revokes that refresh token and returns `204`. Resetting a password revokes all of the user's refresh tokens.
- `GET /api/auth/me` returns the current user's data from the database (not from the token), so it reflects a verified email or a changed role immediately. It returns `401` for a suspended user.

## Ticketing API

- Organizers manage ticket types at `/api/events/{eventId}/ticket-types` and enable paid ticket sales for demonstration through `/api/events/{eventId}/paid-sales/activate-simulation`. The latter is explicitly a simulation and does not verify identity, collect an activation fee, or configure real payouts.
- Authenticated attendees submit `POST /api/orders/checkout` with an event, attendee details, and ticket type quantities. Free orders complete without a payment record; paid orders create a clearly labelled simulated payment. Inventory is checked and updated in a serializable transaction.
- Attendees can list their orders at `/api/orders/me`; order and ticket QR access is limited to the attendee, the event organizer, or a platform administrator. Checkout responses include each ticket's opaque QR payload and PNG data URI.
