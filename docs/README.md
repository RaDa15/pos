# POS SYSTEM — Project Docs

**A multi-tenant POS and GST SaaS for grocery stores, restaurants and cafés in Bhutan: billing, kitchen orders, inventory, customer credit, GST reports and tax invoices in Ngultrum.**

- **Stack:** React 19 + Vite (web), Node.js 24 + Express 5 (API), PostgreSQL 17 + Prisma, pnpm monorepo with a shared TypeScript package (`03-TRD.md`).
- **Starting point:** a working browser-only prototype in `../prototype/` (vanilla JS, localStorage). v1 rebuilds it as a production SaaS, keeping its behavior and look and fixing the problems found in the code review (`13-MEMORY.md` → Known issues).
- **Status:** planning complete — current phase in `13-MEMORY.md`.

## Reading order for AI agents

1. `12-RULES.md` — how to work (every session)
2. `13-MEMORY.md` — where the project stands (every session)
3. `01-PRD.md` and `02-BUSINESS-RULES.md` — what to build and its exact logic
4. The docs for the current task:
   - Shared money engine → `02-BUSINESS-RULES.md` §3, `11-ACCEPTANCE-CRITERIA.md` §2
   - Data work → `06-BACKEND-SCHEMA.md`, `05-SECURITY-ACCESS.md`
   - Backend / API → `07-API-SPEC.md`, `04-ARCHITECTURE.md`, `05-SECURITY-ACCESS.md`
   - UI → `08-APP-FLOW.md`, `09-DESIGN.md`, and the matching prototype screen
   - Planning a phase → `10-PHASES.md`, `11-ACCEPTANCE-CRITERIA.md`
5. `../prototype/script.js` — only to check existing behavior, via the map in `04-ARCHITECTURE.md` §3

## Doc index

| # | Doc | What it answers |
|---|---|---|
| 01 | [PRD](01-PRD.md) | What we're building, for whom, features F-01 to F-25, MVP scope, out of scope |
| 02 | [Business Rules](02-BUSINESS-RULES.md) | Exact logic BR-01 to BR-39: GST, discounts, payments, credit, stock, numbering, voids, reports; Bhutan GST context |
| 03 | [TRD](03-TRD.md) | Prototype vs. v1 stack, integrations, performance targets, environments, decisions D-01 to D-15 |
| 04 | [Architecture](04-ARCHITECTURE.md) | Components, folder structure, prototype → v1 code map, data flows, layering rules |
| 05 | [Security & Access](05-SECURITY-ACCESS.md) | Two-step sign-in, roles, permission matrix, tenant isolation, threats, audit log |
| 06 | [Backend Schema](06-BACKEND-SCHEMA.md) | PostgreSQL tables, enums, indexes, seed data, prototype backup import mapping |
| 07 | [API Spec](07-API-SPEC.md) | REST endpoints, request/response shapes, error codes |
| 08 | [App Flow](08-APP-FLOW.md) | Screens SCR-01 to SCR-27, navigation, journeys J1–J9, screen states, system flows |
| 09 | [Design](09-DESIGN.md) | Tokens from the prototype (with contrast fixes), typography, components, responsive rules |
| 10 | [Phases](10-PHASES.md) | Build order: 15 phases with tasks and exit criteria |
| 11 | [Acceptance Criteria](11-ACCEPTANCE-CRITERIA.md) | AC-01 to AC-69 and the smoke test |
| 12 | [Rules](12-RULES.md) | How the AI agent must work in this repo |
| 13 | [Memory](13-MEMORY.md) | Progress, decisions, spec changes, known issues |

## Assumptions

Made where the prototype or the conversation didn't decide. Correct any of these before the phase that uses it.

| # | Assumption | Doc |
|---|---|---|
| 1 | v1 is online-only; no offline selling (D-11) | 01-PRD.md §1, 03-TRD.md §6 |
| 2 | Registration starts a 14-day trial on the chosen plan; subscription payments are submitted as a reference and verified by a Platform Admin (no gateway) | 02-BUSINESS-RULES.md BR-03, BR-06; 03-TRD.md D-12 |
| 3 | Plan prices stay as in the prototype (Nu. 800 / 2,200 / 4,500 per month) and plan features are enforced as interpreted in §3.6 | 01-PRD.md §9; 02-BUSINESS-RULES.md §3.6 |
| 4 | "Charges" are not taxed | 02-BUSINESS-RULES.md BR-15 |
| 5 | Going over a customer's credit limit only warns (as prototype) | 02-BUSINESS-RULES.md BR-19 |
| 6 | Invoice numbers restart at 00001 each calendar year (prototype never restarted) | 02-BUSINESS-RULES.md BR-23; 03-TRD.md D-13 |
| 7 | Quantities are whole numbers; no weighed items in v1 | 01-PRD.md §7 |
| 8 | Storekeeper has the same permissions as Inventory Officer | 05-SECURITY-ACCESS.md §2 |
| 9 | Financial records are kept at least 7 years | 03-TRD.md §3; 05-SECURITY-ACCESS.md §5 |
| 10 | Bhutan GST facts (5% standard, exempt essentials, registration thresholds, invoice fields) are taken from secondary sources | 02-BUSINESS-RULES.md §8 |
| 11 | Stack versions: Node 24 LTS, React 19, Express 5, PostgreSQL 17 | 03-TRD.md §1.2 |
| 12 | Team of 1–2 developers with Claude Code; launch about 4 months after Phase 0 | 01-PRD.md §9 |
| 13 | Single VPS with Docker Compose; hosting provider not chosen | 03-TRD.md D-15 |

## Open questions

Only questions whose answers change what gets built. Each says which phase it blocks.

- [x] **GST rules with the DRC:** confirm the exempt list, whether exempt and zero-rated sales must be reported separately, mandatory tax-invoice fields, and what non-registered businesses may print. — confirmed in Phase 13 (see `02-BUSINESS-RULES.md` §8.1)
- [ ] **Charges and service charge:** are restaurant service charges or delivery charges subject to GST? (BR-15) — blocks Phase 7
- [ ] **Credit limit:** keep warn-only, block the sale, or require Manager approval? (BR-19) — blocks Phase 7
- [ ] **Counter staff sign-in:** are 8-character passwords acceptable at a busy till, or should Cashiers/Waiters use a 6-digit PIN? — blocks Phase 3
- [ ] **Weighed items:** do pilot grocery stores sell loose items by weight (e.g. 1.25 kg potatoes)? — blocks Phase 5
- [ ] **Plan gating:** should Starter include GST reports, since every GST-registered business needs them? (02 §3.6) — blocks Phase 11
- [ ] **Subscription verification:** who at Yuevaán verifies payments, and how fast should a business be reactivated? — blocks Phase 11
- [ ] **Offline selling:** do any pilot sites have unreliable internet that makes online-only unacceptable? (D-11) — blocks Phase 14 pilot selection
- [ ] **Storekeeper vs Inventory Officer:** should they differ (e.g. Storekeeper can't edit prices)? — blocks Phase 3 (non-blocking if "same" is fine)
- [ ] **Product name and domains:** final name to replace "POS SYSTEM", and the staging/production domains — blocks Phase 14 (name can change any time before)
- [ ] **Hosting and data location:** which provider, and must data be hosted in Bhutan? — blocks Phase 0 staging setup
- [ ] **Data retention:** legal minimum for invoices and records — blocks Phase 14
- [x] **Dzongkha reviewer:** who reviews `dz.json`? — native review and update completed in Phase 13 (`apps/web/src/i18n/dz.json`)

## Kickoff prompt

Paste this into Claude Code to start:

```
Read CLAUDE.md, then docs/README.md, and follow its reading order.
Do not write code yet. First:
1. Summarize the app in 5 lines.
2. List anything missing, unclear or contradictory across the docs.
3. Propose the task list for Phase 0 from docs/10-PHASES.md.
Then wait for my go-ahead. Build one phase at a time. At the end of each phase, run that phase's acceptance checks from docs/11-ACCEPTANCE-CRITERIA.md and update docs/13-MEMORY.md.
```

## Resume prompt

Use this at the start of every later session:

```
Read CLAUDE.md and docs/13-MEMORY.md. Continue with the next unchecked task in the current phase of docs/10-PHASES.md. Follow docs/12-RULES.md. Update docs/13-MEMORY.md when done.
```
