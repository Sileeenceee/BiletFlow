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

## Database migrations

Database schema changes are managed with EF Core migrations in `backend/BiletFlow.Api/Data/EfMigrations`. The API applies pending migrations at startup with `Database.MigrateAsync()`. A fresh Compose database is therefore initialized automatically when the API starts.

Create and apply migrations from the repository root with:

```sh
dotnet ef migrations add <MigrationName> \
  --project backend/BiletFlow.Api \
  --startup-project backend/BiletFlow.Api
dotnet ef database update \
  --project backend/BiletFlow.Api \
  --startup-project backend/BiletFlow.Api
```

`InitialSchema` is the baseline migration for a fresh database. Existing databases created before EF migrations were introduced need a reviewed, data-preserving upgrade migration before applying this baseline; do not drop the Compose volume to apply schema changes.

## Backend regression tests

Run the backend test project with:

```sh
dotnet test backend/BiletFlow.Api.Tests/BiletFlow.Api.Tests.csproj
```

The locale-independent validation test runs without external services. The API integration regression is skipped unless `BILETFLOW_TEST_API_BASE_URL` points to a test API connected to a disposable PostgreSQL database; it creates test accounts, events, and orders in that database. Do not point it at a database containing data you need to keep.

## Authentication API

- `POST /api/auth/login` returns a short-lived `accessToken` (60 minutes) and a `refreshToken` (7 days). Send the access token as `Authorization: Bearer <token>`.
- `POST /api/auth/refresh` with `{ "refreshToken": "..." }` returns a new access/refresh pair and invalidates the refresh token that was sent. Role, suspension, and email-verification status are read from the database at this point, so the new access token is current. A refresh token that was already used, expired, or revoked gets `401`; presenting an already-used one also ends every refresh session of that user, because it means the token was copied.
- `POST /api/auth/logout` with `{ "refreshToken": "..." }` revokes that refresh token and returns `204`. Resetting a password revokes all of the user's refresh tokens.
- `GET /api/auth/me` returns the current user's data from the database (not from the token), so it reflects a verified email or a changed role immediately. It returns `401` for a suspended user.

## Ticketing API

- Organizers manage ticket types at `/api/events/{eventId}/ticket-types` and enable paid ticket sales for demonstration through `/api/events/{eventId}/paid-sales/activate-simulation`. The latter is explicitly a simulation and does not verify identity, collect an activation fee, or configure real payouts.
- Authenticated attendees submit `POST /api/orders/checkout` with an event, attendee details, and ticket type quantities. Inventory (ticket type and optional event `capacity`) is checked and reserved in a serializable transaction. Free orders are confirmed immediately with tickets and no payment record. Paid orders are returned as `Pending` with no tickets and a 15-minute reservation (`expiresAt`); the attendee then calls `POST /api/orders/{orderId}/pay` with `{ "outcome": "succeeded" | "failed" }` (a clearly labelled payment simulation). Success confirms the order and creates the tickets; a failed attempt can be retried until the reservation expires. `POST /api/orders/{orderId}/cancel` cancels the attendee's own pending order. An unpaid order that is older than 15 minutes is released the next time anyone checks out or pays for the same event.
- Organizers can cancel free orders (`POST /api/events/{eventId}/orders/{orderId}/cancel`) and list ticket holders with `GET /api/events/{eventId}/attendees?search=`. A platform admin can suspend paid sales with `POST /api/admin/events/{eventId}/paid-sales/suspend`. Order, payment, cancellation and paid-sales actions are written to the audit log.
- Attendees can list their orders at `/api/orders/me`; order and ticket QR access is limited to the attendee, the event organizer, or a platform administrator. Checkout responses include each ticket's opaque QR payload and PNG data URI.

## BiletFlow Figma Design

https://www.figma.com/design/Uw6KZTD3dWojTLt0fClabK/BiletFlow?node-id=1-231&t=iRrgbjgOvO3ugT7s-1
