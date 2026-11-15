# BiletFlow Check-in (mobile)

React Native (Expo SDK 58, TypeScript) app for **Event Admins**: sign in, pick an assigned event, scan ticket QR
codes, record or undo check-ins, search attendees and watch the attendance totals (SRS 4.8, UC4).

It is online-only by design — offline synchronisation is outside the academic MVP.

## Run it

```bash
npm install
```

```bash
npx expo start
```

Open the project in **Expo Go** on a phone (scan the QR code from the terminal), or press `a` / `i` for an
emulator. `npm run web` gives a browser preview without the camera.

### Server address

The phone must reach the BiletFlow server over the network, so `localhost` will not work on a real device.

1. Start the stack from the repository root: `docker compose up --build`.
2. Find the computer's LAN address (for example `192.168.1.20`).
3. On the sign-in screen set **Server address** to `http://192.168.1.20:8080` — the frontend container, which
   proxies `/api` to the API. The address is remembered after the first sign-in.

To change the default, start Expo with `EXPO_PUBLIC_API_URL=http://192.168.1.20:8080`.

### Account

Only accounts with the `EventAdmin` role can sign in. An organizer grants it on the website:
**Manage event → Team → Assign event admin** (the account needs a verified email).

## Structure

| File | Purpose |
| --- | --- |
| `App.tsx` | Chooses the screen: sign in → events → check-in |
| `src/api.ts` | API calls, secure session storage, automatic token refresh |
| `src/screens/LoginScreen.tsx` | Sign in and server address |
| `src/screens/EventsScreen.tsx` | Assigned events only |
| `src/screens/EventScreen.tsx` | Totals, QR scanner, result screen, attendee search, undo |
| `src/ui.tsx` | Shared colours, button, card |

## Checks

```bash
npx tsc --noEmit
```

```bash
npx expo-doctor
```

## Known limits

- Admitting someone from the attendee list still needs their ticket code: the API checks in by code, not by
  ticket ID. The list shows status and lets staff undo a check-in.
- Plain HTTP is allowed for local-network demo servers (Android cleartext, iOS local networking). Use HTTPS for
  anything public.
- Store publication and offline scanning are out of scope for the MVP.
