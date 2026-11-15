# Work log — web frontend completion and mobile app (15 Nov 2026)

Source of requirements: `BiletFlow_SRS_Initial_Draft.pdf` (v0.3). Nothing in `backend/` was changed; one fix was
made to `docker-compose.yml` (section 5).

## 1. What was already there

**Backend** — complete against the SRS after commit `a88b657 Finalize backend against the SRS`: auth with refresh
tokens, events, ticket types, checkout, PDF/QR tickets, promo campaigns, verification, support, plus analytics,
event history, calendar export, assigned seating, refunds, paid-sales checklist, event reports, notifications and
the whole admin API.

**Web frontend** — stopped at "week 8". It had: sign in / register / verify / reset password, event list and
event page with general-admission checkout, my tickets, create and manage event (details, ticket types,
campaigns, attendees, orders, team), organizer profile, support inbox and a browser check-in page.

**Mobile app** — did not exist.

## 2. Gaps found (backend ready, no screen for it)

| SRS | Missing in the web frontend |
| --- | --- |
| 4.1 | Refresh-token sessions, real sign-out, resend verification, change email/password, delete account |
| 4.2 | Venue address, time zone, refund policy, editing image URLs |
| 4.3.1 | Seat map for attendees, seating setup for organizers |
| 4.5 | Activation checklist (verification, fee, terms) — only a one-click button existed |
| 4.6 | Server-side price quote with promo validation; fees/refunds/payout view |
| 4.9 | Organizer refunds |
| 4.10 | Notification centre |
| 4.11 | Server-built `.ics`, Google and Outlook links |
| 4.12 | Entire admin portal; reporting an event |
| 4.13 | Support from event/ticket context, escalation |
| 4.15 | Organizer analytics dashboard |
| 4.16 | Upcoming/Active/Completed/Cancelled views, activity timeline |
| 7 | Kazakh / Russian / English interface |
| 4.8 | Dedicated mobile verification app |

## 3. What was built — web (`frontend/`)

### New pages
- **`/organizer/dashboard`** (`pages/OrganizerDashboard.tsx`) — totals, date range, status tabs, links to
  analytics/history, "duplicate as draft".
- **`/admin`** (`pages/Admin.tsx`) — Overview with CSV exports, Users (search, role, suspend/reinstate), Events
  (suspend/reinstate event and paid sales), Reports, Orders, Payments, Refunds, Activations, Promo activity,
  Support cases, Settings (fees).
- **`/notifications`** (`pages/Notifications.tsx`) — list, mark one/all read, link to the related case, order or
  event. Unread count shown in the navigation bar.
- **`/account`** (`pages/Account.tsx`) — change email/password, resend verification, delete account.

### New tabs in Manage event (`pages/manage/`)
- **Analytics** — capacity, revenue breakdown, sales over time, by ticket type, campaigns, attendance; filters
  for date range and ticket type.
- **History** — read-only timeline with date and activity-type filters.
- **Seating** — general admission or the predefined venue; link each section to a ticket type; live preview.
- **Paid sales panel** (Overview tab) — checklist with simulated verification, fee payment, terms and activation.
- **Orders** — full simulated refund with reason, refund list, gross/fees/refunds/payout summary.
- **Overview** — venue address, time zone, refund policy, image URLs; lifecycle and suspension shown.
- **Tickets** — now shows available / reserved / sold / refunded / checked-in.

### Changed pages
- **Event page** (`pages/EventDetail.tsx`) — interactive seat map for assigned seating, server quote showing the
  promo discount and total before checkout, calendar buttons (.ics / Google / Outlook), refund policy, "ask the
  organizer", "report this event", cancelled banner.
- **My tickets** (`pages/Orders.tsx`) — calendar file now comes from the server, seat shown per ticket, refund
  amount, support link per ticket.
- **Support** (`pages/Support.tsx`) — opens the form from event/order/ticket links, shows that context, lets
  attendees escalate to platform support.
- **Check-in page** (`pages/EventAdmin.tsx`) — sends the selected event so tickets of another event are rejected.
- **Navigation** (`components/Nav.tsx`) — Dashboard, Admin, Notifications, Account, language picker.

### Shared code
- `api/platform.ts`, `api/admin.ts` — typed calls for every endpoint above.
- `components/SeatMap.tsx` — SVG seat map; each state has a colour **and** a symbol, every seat has a text
  label, works with keyboard.
- `lib/i18n.tsx` — Kazakh, Russian, English; choice is remembered; dates and money follow the language.
- `api/client.ts`, `lib/storage.ts`, `lib/auth.tsx` — stores the refresh token, renews an expired session
  automatically, sign-out revokes it on the server.

### Tests
- New: `components/SeatMap.test.tsx` (3 tests), one session-refresh test in `api/client.test.ts`.
- Updated: `pages/EventDetail.test.tsx` mocks the new API module.

## 4. What was built — mobile (`mobile/`)

New Expo SDK 58 / React Native / TypeScript app, **BiletFlow Check-in**. See `mobile/README.md` for running it.

- Sign in (EventAdmin accounts only), editable server address, session kept in the device keystore.
- Only assigned events are listed.
- Camera QR scanning; a scan validates and records the check-in in one step.
- Result screen with distinct colour, symbol and wording: Admitted, Already used, Cancelled, Refunded, Not valid
  (campaign QR codes land here).
- Undo a check-in from the result screen or the attendee list.
- Attendee search by name or email with status.
- Registered / checked-in / attendance totals, refreshed every 15 seconds.
- Manual ticket-code entry with "Check in" and "Validate only".

## 5. Verification

| Check | Result |
| --- | --- |
| Web type-check + production build (`npm run build`) | Pass |
| Web tests (`npm run test:run`) | 24 of 24 pass |
| Web lint (`npm run lint`) | No errors; 4 warnings (2 existed before) |
| Mobile type-check (`npx tsc --noEmit`) | Pass |
| Mobile `npx expo-doctor` | 20 of 20 checks pass |
| Mobile bundle (`npx expo export --platform web`) | Pass |
| API flows, scripted against the Docker stack | 90 checks pass |
| Web screens clicked through against the Docker stack | Pass (list below) |
| Mobile app (web build) against the Docker stack | Pass (list below) |

**API script** covered: register / verify / sign in / refresh / sign out, organizer profile, event create and
update, ticket types, the activation checklist, campaign and link resolve, price quote, free and paid checkout,
simulated payment, PDF ticket, calendar links and `.ics`, staff assignment, validate / check-in / already used /
campaign QR rejected / undo, refund, analytics, dashboard, history, seating setup, seat checkout, double-sale
refusal, support case with reply / status / escalation, notifications, event report, and every admin endpoint
including suspend / reinstate, report resolution, settings and CSV export.

**Web, in the browser:** sign-in form; seat map, seat checkout and seat shown on the ticket; campaign-link
checkout with the discount and simulated payment; notifications; support form opened from an event; account
page; organizer dashboard; Analytics, History, Seating and Orders tabs including a refund; activation checklist;
admin overview, users, events (suspend and reinstate through the reason dialog), payments, support and settings.

**Mobile, in the browser at phone size:** a non-staff account is refused; assigned event listed; check-in shows
"Admitted" and the totals update; the same ticket again shows "Already used"; a refunded ticket shows
"Refunded"; a campaign link shows "Not valid"; undo from the attendee list returns the totals to zero.

**Not verified:** camera scanning on a real phone (the browser preview has no camera; codes were typed), and the
native Android / iOS builds. Email delivery was not inspected in Mailpit.

### Defects found during live testing and fixed

- **`docker-compose.yml` health check could never pass.** It probed `/health` over HTTP, the API answers HTTP
  with a redirect to HTTPS, so the frontend container never started. The probe now uses HTTPS.
- **Campaign-link checkout was rejected.** The page sent both the promo code and the campaign token; the API
  accepts only one. It now sends the token while the pre-filled code is untouched, and the typed code otherwise.
- **Seat labels repeated status and price.** The map and the selection list now show "Section, row, seat".
- **Admin reason prompts did nothing in some browsers** (`window.prompt` is not always available). Replaced with
  an in-page dialog (`components/ReasonDialog.tsx`).
- **Blank page after a redeploy** from a cached `index.html`. `frontend/nginx.conf` now sends `no-cache` for it.
- The verification step in the activation checklist is disabled once it is complete.

### Test data left in the development database

Accounts `e2e-organizer-afb2eb@example.test`, `e2e-attendee-afb2eb@example.test`,
`e2e-staff-afb2eb@example.test`; events "E2E concert afb2eb" and "E2E seated afb2eb"; a few orders, two refunds,
one support case and one resolved event report.

## 6. Known gaps

- **Translations cover** the navigation bar, event page, checkout and My tickets. The event list, sign-in pages
  and all organizer/admin screens are English only.
- **Create event form** does not have the new fields (address, time zone, refund policy); they are set on the
  Manage → Overview tab after saving.
- **Mobile attendee list cannot admit** someone directly — the API checks in by ticket code only.
- **Admin sign-in** uses the platform administrator the API seeds at start-up from `Seed:PlatformAdmin` in
  `backend/BiletFlow.Api/appsettings.Development.json`. Outside Development that setting must be supplied, or
  `/admin` cannot be reached.
- Web bundle is 555 kB (Vite warns above 500 kB); no code-splitting was added.
