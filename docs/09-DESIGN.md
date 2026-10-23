# Design — POS SYSTEM

The prototype's look (`prototype/style.css`) is approved and carries over. This doc turns it into tokens and components, with a few accessibility fixes marked **v1 change**. All colors are checked against WCAG AA (contrast ratios in brackets).

## 1. Design direction

- **Style:** calm, paper-and-ink business tool. Navy sidebar, warm off-white "paper" background, white panels with thin warm-grey borders, teal for actions and good news, amber for warnings, brick red for problems. Numbers and codes in a monospace font so columns of money line up.
- **Mood words:** trustworthy, quick, local, uncluttered.
- **References:** the prototype screens (open `prototype/index.html`, sign in to "Pema Store" or "Test Restaurant" with password `1234`) are the visual reference for every screen.
- **Avoid:** gradients on buttons or cards (the only gradient is the sign-in background), purple or neon accents, shadows on in-app cards, icon fonts (use inline SVG or plain text/emoji as in prototype), animations longer than 450 ms, tap targets under 44 px on POS and kitchen screens.

## 2. Design tokens

Defined as CSS custom properties in `apps/web/src/styles/tokens.css`. Components use only these tokens; no raw hex values in component CSS.

### Colors

| Token | Light | Use |
|---|---|---|
| `--navy` | #14213D | Sidebar, default button, auth background base, receipt brand text |
| `--navy-2` | #1C2E52 | Active nav item, default button hover |
| `--paper` | #F7F6F2 | Page background |
| `--panel` | #FFFFFF | Cards, tables, modals, inputs |
| `--ink` | #12131A | Body text (17.1:1 on paper) |
| `--muted` | **#5F6673** (v1 change from #6B7280, which was 4.47:1 on paper) | Secondary text, labels, table headers (5.3:1 on paper) |
| `--line` | #E4E1D8 | Borders, dividers |
| `--line-soft` | #EFEDE6 | Table row dividers, neutral pill background |
| `--teal` | **#187A63** (v1 change from #1F8A70, which was 4.26:1 with white) | Primary button, active nav border, focus ring, chart bars (5.3:1 with white) |
| `--teal-dark` | #166B57 | Primary hover, success text (6.4:1 with white) |
| `--teal-tint` | #E4F3EC | Success pill / badge background |
| `--teal-wash` | #F1FAF6 | Selected plan card, success notice background |
| `--amber` | #D98E22 | Chart segments and decorative accents only — never text (2.7:1) |
| `--amber-text` | **#9A6212** (v1 change: prototype used #D98E22 for expiry dates and kitchen notes) | Warning text (4.7:1 on paper) |
| `--amber-tint` | #FDF1DD | Warning pill / trial badge background |
| `--amber-ink` | #8A5A0E | Text on `--amber-tint` (5.3:1) |
| `--alert-bg` | #FFF4E5 | Alert banner background |
| `--alert-border` | #F5C77E | Alert banner border |
| `--alert-ink` | #8A5A00 | Alert banner text (5.5:1) |
| `--red` | #B3452C | Errors, danger text, negative values (5.5:1 on white) |
| `--red-tint` | #FBE7E2 | Danger pill / expired badge background |
| `--red-border` | #EAC3B8 | Danger button border |
| `--badge-red` | **#C9302C** (v1 change from #E5484D, 3.9:1) | Sidebar count badge background (5.3:1 with white) |
| `--neutral-pill` | #EEEEEE / text #555555 | Suspended, cancelled, inactive |
| `--nav-text` | #C7CBDA | Sidebar items (9.9:1 on navy) |
| `--nav-sub` | #9AA4C4 | Sidebar business name, role (6.5:1 on navy) |
| `--nav-label` | **#8F99B8** (v1 change from #6E7796, 3.6:1) | Sidebar section labels (5.6:1 on navy) |
| `--placeholder` | **#6E727F** (v1 change from #A8ACB8, 2.3:1) | Input placeholders (4.8:1 on white) |
| `--backdrop` | rgba(18,19,26,.45) | Modal backdrop |

Dark mode: N/A — light only in v1.

**Sign-in background** (as prototype): `radial-gradient(circle at 15% 20%, rgba(31,138,112,.24), transparent 32%), radial-gradient(circle at 85% 80%, rgba(217,142,34,.18), transparent 30%), linear-gradient(135deg, #0b1730 0%, #14213D 50%, #1a3150 100%)`.

### Typography

Fonts are self-hosted (`03-TRD.md` §2). Stack: `'Manrope', 'Noto Sans Tibetan', 'Jomolhari', 'Microsoft Himalaya', system-ui, sans-serif`. Dzongkha text uses Noto Sans Tibetan automatically through the stack.

| Token | Font | Size / line height | Weight | Use |
|---|---|---|---|---|
| `--type-auth-title` | Manrope | 22/28 | 800 | Sign-in and register card titles |
| `--type-page-title` | Manrope | 17/24 | 700 | Top bar screen title |
| `--type-section` | Manrope | 15/22 | 800 | Section titles |
| `--type-body` | Manrope | 13.5/20 | 400 | Default text, tables, inputs, buttons (700) |
| `--type-label` | Manrope | 12.5/18 | 600 | Form labels, KPI labels (12/600) |
| `--type-small` | Manrope | 11.5/16 | 400–500 | Hints, notes, captions |
| `--type-th` | Manrope | 11/16, uppercase, letter-spacing .04em | 600 | Table headers |
| `--type-kpi` | IBM Plex Mono | 24/30 | 800 | KPI values |
| `--type-mono` | IBM Plex Mono | 13.5/20 | 400–600 | Money, invoice numbers, barcodes, codes |
| `--type-receipt` | IBM Plex Mono | 12/16 (items 11.5) | 400/700 | Receipt body; receipt shop name in Manrope 15/800 |

Money is always `Nu. 1,23,456.00` (Indian grouping, 2 decimals) via `formatMoney()` in `packages/shared`.

### Spacing, radius, shadow

- **Spacing scale (px):** 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 34. Content padding 24 top / 28 sides / 60 bottom; card padding 16 × 18; grid gap 16.
- **Radius:** `--radius-sm` 6 (inputs, buttons), `--radius-md` 10 (cards, tables, plan cards), 12 (modals), 14 (auth card), 20 (pills, badges).
- **Shadow:** none on in-app cards. Toast `0 6px 20px rgba(0,0,0,.2)`; auth card `0 25px 70px rgba(0,0,0,.28)`; auth logo `0 8px 22px rgba(20,33,61,.22)`.
- **Motion:** auth card fade-up 450 ms; progress bar 550 ms; chart bar height 500 ms. Respect `prefers-reduced-motion` (disable all).

## 3. Components

| Component | Variants | States | Notes |
|---|---|---|---|
| Button | default (navy), primary (teal), outline (white, `--line` border), danger (white, red text, `--red-border`), link (no background, teal-dark text); size `sm` (5×10 px, 12 px) | default, hover, focus (2 px teal ring), disabled (45% opacity, not-allowed), loading (spinner, disabled) | Min height 36 px; 44 px on POS and kitchen screens |
| Input / Select / Textarea | text, password (Show/Hide toggle), number, date, time, search, file (as button) | default, focus (2 px `--teal` outline), error (red border + message below), disabled | Label above (12.5/600), error below (12.5, red) |
| Field | wraps label + control + error/hint | — | 12 px bottom margin |
| Card / KPI card | plain, KPI (label + mono value; value colors: warn = red, good = teal-dark) | — | |
| DataTable | standard, compact (receipt-like) | loading (skeleton rows), empty (centered muted message, 36 px padding) | In a `table-wrap` card that scrolls horizontally on small screens (**v1 change:** prototype clipped with `overflow:hidden`) |
| Pill | Completed (teal tint), Voided / Cancelled / Out of stock (red tint), Low stock / Partially (amber tint), neutral | — | 11 px / 700, radius 20 |
| Subscription badge | active, trial, expired, suspended, cancelled | — | Uppercase 11 px / 700 |
| Modal | normal (max 520 px), wide (max 720 px, two-column form) | open, submitting | Close ✕ top-right; footer right-aligned Cancel + primary; max height 88vh scroll |
| Toast | info (navy) | — | Bottom-right, 2.6 s, one at a time, `role="status"` |
| Alert banner | warning (`--alert-*`), danger (red tint) | — | Top of content; optional link button |
| Plan card | default, selected (teal border, teal wash) | hover | Price in mono 19/700 |
| Stepper / progress | 3-step bar (register), auth progress bar | done = teal | |
| Pay tabs | segmented buttons | active (teal wash, teal border) | Subscription payment modal |
| Nav item | default, hover, active (navy-2 background, 3 px teal left border, 600) | focus | Real `<a>`/`<button>` elements (**v1 change:** prototype used clickable `div`s) |
| Nav badge | count | — | `--badge-red`, 11 px / 700 |
| Language toggle | English / རྫོང་ཁ | on (white on navy in sidebar; navy on white in auth card) | |
| Bar chart | single series, signed (profit: negative bars red) | empty (message) | Value label above each bar; date labels DD/MM |
| Donut chart | up to 6 segments (teal, amber, then teal-dark, navy-2, muted, red) | empty | Total in the center, legend at right |
| Barcode | invoice / product code bars + human-readable text | — | Ported from `barcodeBarsHTML`; decorative — the text below is the real value |
| Receipt | screen, print, PDF | voided (diagonal VOID stamp in red, 40% opacity) | 380 px wide on screen; 80 mm on paper |
| Empty state | text + optional action | — | |
| Skeleton | line, block | — | `--line-soft` with shimmer (none if reduced motion) |

## 4. Layout & responsive

| Breakpoint | Width | Layout |
|---|---|---|
| Mobile | < 768 px | Sidebar becomes a drawer; top bar shows menu button, title and status badge; grids collapse to 1 column; POS: product search and cart stack vertically with a sticky "Grand total · Pay" bar at the bottom; kitchen columns scroll horizontally |
| Tablet | 768–1199 px | Sidebar 200 px (or drawer below 900 px); KPI grids 2 columns; POS two columns 1fr / 1fr; kitchen board scrolls horizontally (columns min 220 px) |
| Desktop | ≥ 1200 px | Sidebar 224 px + content; KPI grids 4 columns; POS 1.3fr / 1fr; kitchen board 6 equal columns; chart grid 1.5fr / 1fr |

- Content max width: none for app screens (tables use the space); auth cards 440–640 px; platform screens max 1100 px.
- **Print (`print.css`):** hide everything except `#print-area`; receipts at 80 mm with 4 mm margins; reports at A4 portrait with the report title, business name, range and generated time on top.

## 5. Accessibility

- Contrast: all text tokens meet 4.5:1 on their backgrounds (§2); `--amber` and `--line` are never used for text.
- Every interactive element is a real button, link or form control, reachable by Tab, with a visible 2 px teal focus ring.
- Touch targets ≥ 44 × 44 px on POS, kitchen and payment modals; ≥ 36 px elsewhere.
- Status is never color-only: pills have text; low stock shows "⚠" plus red; balance shows "Balance due" / "Overpaid".
- Form errors are linked to their fields (`aria-describedby`) and announced; toasts use `role="status"`.
- Modals trap focus, close with Esc, and return focus to the opener.
- `lang` attribute switches to `dz` when Dzongkha is selected.

## 6. Content & tone

- **Voice:** short, plain, polite. Address the user as "you". No jargon ("Subscription inactive", not "Tenant entitlement revoked").
- **Buttons:** verb first — "Complete sale", "Send to kitchen", "Receive payment", "Record expense", "Void invoice".
- **Errors:** say what happened and what to do: "Not enough stock for Sugar 1kg. Available: 1." / "Payments must add up exactly to the grand total before completing the sale."
- **Empty states:** one sentence plus an action (messages listed in `08-APP-FLOW.md` §4).
- **Formats:** money `Nu. 1,23,456.00` (receipts drop "Nu." per line and show "Grand total (Nu.)"); dates `DD/MM/YYYY`; times `HH:mm` 24-hour; ranges "03/11/2026 – 30/11/2026".
- **Names:** the product is "POS SYSTEM" in UI chrome until the final name is chosen (Open questions); receipts show the business's own name and "Powered by Yuevaan Consultancy · Thimphu, Bhutan".
- **Dzongkha:** start from the prototype's `I18N` map; terms the prototype marked lower-confidence keep the "Dzongkha · English" form. A native speaker reviews `dz.json` before launch.

## 7. Do / Don't

- **Do** keep the scan box focused on the POS; show totals in mono; use teal only for primary actions and positive states.
- **Do** keep tables dense (9–10 px row padding) on admin screens and roomy on POS.
- **Don't** introduce new colors outside §2, use amber for text, hide horizontal overflow on tables, or put more than one primary button in a card.
