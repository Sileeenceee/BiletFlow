# BiletFlow mobile app

React Native app (Expo SDK 58, Expo Router, TypeScript) with the same features as the website, plus the
ticket scanner for event staff. Every role uses it:

| Role | Bottom tabs | What they can do |
| --- | --- | --- |
| Anyone | Explore, More | Browse and search events, filter by city, open event pages, sign in or register |
| Attendee | Explore, My tickets, More | Buy or reserve tickets (general admission or seat map), promo codes and campaign links, simulated payment, QR codes at the entrance, PDF/QR/.ics download and share, support, notifications |
| Organizer | Explore, Dashboard, More | Dashboard with lifecycle views; create events; manage each event: details, paid-sales activation, ticket types, seating, campaigns and campaign QR, attendees, orders and refunds, analytics, history, staff; organizer profile |
| Event staff | Explore, Check-in, More | Camera QR scanning, check-in, undo, attendee search, live totals |
| Platform admin | Explore, Dashboard, Admin, More | All 11 admin sections: overview and CSV exports, users, events, reports, orders, payments, refunds, activations, promo activity, support cases, settings |

The More tab holds notifications, support, account settings, language (Қазақша / Русский / English) and
sign-out.

## Run it

```bash
npm install
```

```bash
npx expo start
```

Open the project in **Expo Go** (scan the QR code in the terminal), or press `a` / `i` for an emulator.
`npm run web` gives a browser preview without the camera.

### Server address

The phone must reach the BiletFlow server over the network, so `localhost` will not work on a real device.

1. Start the stack from the repository root: `docker compose up --build`.
2. Find the computer's LAN address (for example `192.168.1.20`).
3. On the sign-in screen set **Server address** to `http://192.168.1.20:8080` — the frontend container, which
   proxies `/api` to the API. The address is remembered.

To change the default, start Expo with `EXPO_PUBLIC_API_URL=http://192.168.1.20:8080`.

### Links from emails

Verification and password-reset emails link to the website. In the app, paste the `token=` part of the link
on the **Verify email** or **Set a new password** screen. In Development the API also returns the token
directly, and the app offers a button that uses it.

Campaign QR codes open `biletflow://campaign/<token>` in the app as well as on the website.

## Structure

| Path | Purpose |
| --- | --- |
| `src/app/` | Routes (Expo Router). `(tabs)/` holds the bottom tabs; other files are stacked screens |
| `src/screens/manage/` | The nine Manage event tabs |
| `src/screens/admin/` | The admin portal sections |
| `src/api/` | API calls. `events`, `workflows`, `platform`, `admin`, `auth` are copies of `frontend/src/api`; `client.ts` and `checkin.ts` are app-specific |
| `src/lib/` | Session storage (secure store), auth context, translations, formatting, file sharing |
| `src/components/` | Shared UI: buttons, fields, pickers, date fields, seat map, event form, reason dialog |

### Translations are shared with the website

`src/lib/i18n.tsx` imports the website's dictionaries from `frontend/src/lib/messages.ts` (Metro watches that
folder, see `metro.config.js`). Texts that only exist in the app are in `src/lib/mobileMessages.ts`. When you
add a key on the website, the app picks it up on the next build.

### API modules are copies

`src/api/events.ts`, `workflows.ts`, `platform.ts`, `admin.ts` and `auth.ts` are copied from
`frontend/src/api/`. When an endpoint changes, update both.

## Checks

```bash
npm test
npm run typecheck
```

```bash
npm run lint
```

```bash
npx expo-doctor
```

## Known limits

- Online only: there is no offline mode for buying tickets or scanning.
- Admitting someone from the staff attendee list still needs their ticket code: the API checks in by code.
- Plain HTTP is allowed for local-network demo servers (Android cleartext, iOS local networking). Use HTTPS for
  anything public.
- Store publication is out of scope for the MVP.
