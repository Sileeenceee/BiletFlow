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

For an existing database created with the earlier event schema, apply `backend/BiletFlow.Api/Data/Migrations/001_align_legacy_schema.sql` once before starting the API. It migrates existing event values into the current model, preserves event rows, and removes legacy-only columns.
