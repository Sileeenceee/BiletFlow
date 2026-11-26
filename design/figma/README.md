# BiletFlow — Figma design export

Source: Figma file `Uw6KZTD3dWojTLt0fClabK` ("BiletFlow"), exported 2026-11-26.
Desktop screens are 1440px wide at 1x; mobile screens are 390×844 (iOS) at 2x.

## Screens (64)

### 1-authentication (4)
01 Log in · 02 Create account · 03 Check your inbox (email verification) · 04 Forgot / reset password

### 2-attendee (13)
01 Home · 02 Events browse · 03 Event detail · 04 Seat selection · 05 Free event reserve ·
06 Checkout (attendee details) · 07 Order confirmed · 08 Payment failed · 09 My tickets ·
10 Ticket QR · 11 Support chat · 12 New support request · 13 Cancelled event / refund

### 3-platform-admin (5)
01 Moderation: users and events · 02 Paid sales, refunds and disputes ·
03 Escalated support and promo activity · 04 Support case · 05 Platform settings

### 4-organizer (16)
01 Dashboard · 02 Create event: details · 03 Create event: tickets and seating ·
04 Create event: review and publish · 05 Event overview · 06a/06b Paid sales activation (two variants) ·
07 Attendees and orders · 08 Order detail and refund · 09 Promo codes and campaign QR ·
10 Analytics · 11 Event admins · 12 Support · 13 Notifications · 14 Cancel event (confirmation) ·
15 Event history and timeline

### 5-mobile (26)
Attendee: 01 Welcome/log in · 02 Sign up · 03 Main page · 04 Event detail · 05 Seat selection ·
06 Checkout · 07 Order confirmed · 08 My tickets · 09 Ticket QR · 10 Support chat ·
11 Profile and role switch · 13 Notifications
Organizer: 12 Create event · 14 Organizer home · 15 Tickets and paid sales · 16 Manage event ·
17 Promo and campaign QR · 18 Attendees and refund · 19 Analytics · 20 Support inbox
Event admin (check-in): 21 Assigned events · 22 Scan · 23 Valid ticket · 24 Already used ·
25 Campaign QR rejected · 26 Search and undo

## Design tokens (derived from usage — the file defines no text styles or variables)

### Typography
- **Headings:** Manrope Bold — 64, 58, 46, 38, 34, 32, 30, 28, 26, 24, 23, 22, 20, 19, 18, 17, 16
- **Body / UI:** Inter — Regular 11–16 (14–15 most common), Bold 11–17 for labels and buttons, Semi Bold 12
- Bold 26 Inter is used for prices/totals

### Colors (by frequency)
| Role | Hex |
|---|---|
| Text primary | `#0F172A` |
| Text secondary | `#475569`, `#64748B`, `#334155` |
| Text muted | `#94A3B8` |
| Brand navy (headers, dark surfaces) | `#1B2A4A`, `#2E3D63`, `#3D4C74`, `#46557A`, `#5B6B92` |
| Primary blue | `#4D7AED` (buttons, links, active), `#3A63D8`, `#2B4BB5`, `#1D4ED8` |
| Blue tints | `#DCE6FD`, `#EEF3FE`, `#F0F5FF`, `#EAF0FD`, `#DBEAFE`, `#C9D4EE` |
| Accent yellow (primary CTA, logo) | `#FBBF24`; tint `#FEF3C7`; text-on-tint `#92400E` / `#B45309` |
| Success | `#15803D`, `#166534`; bg `#DCFCE7` |
| Danger | `#B91C1C`; bg `#FEE2E2` |
| Info / cyan tag | `#164E63` on `#CFFAFE` |
| Purple accent | `#7C3AED` |
| Surfaces | `#FFFFFF`, `#F6F8FB`, `#F1F5F9`, canvas `#F5F5F5` |
| Borders | `#E2E8F0`, `#CBD5E1`, `#DCE5F7`, `#C3D0EE`, `#9AA9CF` |

Gradient (hero): `#5346D6 → #705CD2 (35%) → #A39062 (70%) → #3A41B6`

Currency formatting in the design: `8 240 ₸` (space thousands separator, ₸ suffix).
Languages shown in the header switcher: ҚАЗ / РУС / ENG.
