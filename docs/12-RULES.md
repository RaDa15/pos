# Rules — POS SYSTEM

Instructions for the AI coding agent (Claude Code) working in this repo. Read this file and `13-MEMORY.md` at the start of every session.

## 1. Before every task

1. Read `docs/13-MEMORY.md` for the current phase, next step, decisions and known issues.
2. Read the docs the task touches (map in `docs/README.md` → Reading order). Rule IDs (BR-xx), features (F-xx), screens (SCR-xx) and acceptance criteria (AC-xx) are how the docs connect — follow them.
3. If the task isn't part of the current phase in `docs/10-PHASES.md`, say so and ask before starting.
4. For anything bigger than a small fix, state a short plan (files to change, tests to add) before writing code.
5. When behavior is unclear, check how the prototype does it (`prototype/script.js`, function names in `04-ARCHITECTURE.md` → Prototype → v1 map), then check whether the docs change that behavior (marked "v1 change" or "prototype: …"). If still unclear, ask.

## 2. Scope

- Build only what the current phase asks for. Don't add features, screens, fields, settings or options that aren't in the docs.
- Don't build anything listed in `docs/01-PRD.md` §7 "Out of scope" (offline mode, payment gateways, refunds, multi-branch, weighed items, email/SMS…).
- Ask before adding any dependency not named in `docs/03-TRD.md` §1.2, and say why it's needed.
- Don't refactor unrelated code while working on a task.
- Never edit, run as part of the app, or deploy anything in `prototype/`. It's a read-only reference.

## 3. When docs and code disagree

- The docs are the source of truth. If a doc is wrong, missing something, or two docs contradict each other, stop and ask. Don't guess.
- When the user approves a change: update the doc first, then the code, and add a line to `13-MEMORY.md` → Spec changes.
- New error codes, enums, permissions or environment variables go into their doc (`07` §2, `06` §4, `05` §3, `03` §4) in the same change.

## 4. Stack rules

- TypeScript strict everywhere. No `any`; use `unknown` and narrow with Zod.
- **Money:** only `packages/shared/src/money` computes tax, discounts, totals, rounding and words. Never write `Math.round(x * 100) / 100`, float sums of money, or tax math anywhere else. Convert Prisma `Decimal` with the shared helpers.
- **Validation:** every request body and query uses a Zod schema from `packages/shared/src/schemas` with `.strict()`. Never pass `req.body` to Prisma.
- **Tenancy:** services receive `ctx` (`businessId`, `employeeId`, `role`, `plan`) from the session. Never read `businessId` from the body, query or params. All tenant queries go through the tenant-scoped Prisma client.
- **Transactions:** any change that writes more than one row uses `prisma.$transaction`. Numbers (invoice, KOT, CR, PUR) come only from `lib/counters.ts` inside that transaction. Audit rows are written with `lib/audit.ts` inside the same transaction.
- **Permissions:** every route declares `requirePermission('<key>')` using keys from `05-SECURITY-ACCESS.md` §3, plus `requireActiveSubscription` / `requirePlanFeature` where `07-API-SPEC.md` marks **Sub** or **Plan**. The web hides UI with `can()`, but never relies on hiding.
- **Dates:** business days and ranges are converted only in `apps/api/src/lib/time.ts` (Asia/Thimphu). Never use `toISOString().slice(0, 10)` for a business date (a prototype bug).
- **Web data:** server data only through TanStack Query hooks in `apps/web/src/api`. Components never call `fetch`. No global mutable state object.
- **Client storage:** no business data in `localStorage` or `IndexedDB`. Only the pre-sign-in language and the POS cart (`sessionStorage`) are allowed.
- **Security:** no `dangerouslySetInnerHTML`, no HTML built from strings, no inline event-handler strings, no image `src` except our `/uploads/` URLs or bundled assets. Never log passwords, session IDs, CSRF tokens or request bodies.
- **Don't copy prototype patterns:** global `S` state, `innerHTML` templates, inline `onclick`, plain-text passwords, whole-collection saves, hard-coded credentials, demo controls in production UI.

## 5. Code conventions

| Item | Convention |
|---|---|
| Files | `kebab-case.ts`; React components `PascalCase.tsx` |
| Components, types | `PascalCase` |
| Variables, functions | `camelCase` |
| Constants | `UPPER_SNAKE_CASE` |
| DB tables / columns | `snake_case`, exactly as in `docs/06-BACKEND-SCHEMA.md` (Prisma `@map`/`@@map`) |
| API JSON | `camelCase`, exactly as in `docs/07-API-SPEC.md` |
| Folder placement | `docs/04-ARCHITECTURE.md` §3 — API modules `routes.ts` / `controller.ts` / `service.ts`; web `features/<screen>` |
| Rule references | Comment the rule ID where a business rule is implemented: `// BR-24: void restocks tracked lines only` |
| Labels and text | Every user-facing string through `t('key')`; add the key to `en.json` (Dzongkha may fall back) |
| Styles | CSS Modules using tokens from `styles/tokens.css`; no hex colors in component CSS; no new colors |

Keep functions small and single-purpose. Prefer explicit field picking over spreading objects into database calls.

## 6. Data & security

- Enforce every permission in `docs/05-SECURITY-ACCESS.md` on the server.
- Validate all input on the server with the rules in `docs/02-BUSINESS-RULES.md` §5.
- Never commit secrets. Add every new environment variable name to `.env.example` and `docs/03-TRD.md` §4.
- Change the schema only with Prisma migrations, and update `docs/06-BACKEND-SCHEMA.md` in the same commit.
- Financial records (sales, payments, stock movements, audit logs) are never hard-deleted or edited after the fact, except through the documented void flow.
- Add every new list or detail route to the tenant-isolation test (AC-58, AC-59).

## 7. UI

- Use only the tokens and components in `docs/09-DESIGN.md`. Match the prototype's look for each screen.
- Every screen implements the standard loading, empty, error and success states in `docs/08-APP-FLOW.md` §4, with the exact messages listed there.
- POS: keep focus in the scan box after every action; buttons at least 44 px tall.

## 8. Testing

- Every BR implemented in `packages/shared` gets unit tests, including the worked examples in `02-BUSINESS-RULES.md` §3.3 and `11-ACCEPTANCE-CRITERIA.md` §2.
- Every API route gets Supertest tests for: success, validation error, each permission it denies, tenant isolation, and its documented error codes.
- Journeys J1–J9 in `08-APP-FLOW.md` §3 get Playwright tests by Phase 13.
- Run `pnpm test` and `pnpm lint` before saying a task is done. Before marking a phase done, run its AC items from `docs/11-ACCEPTANCE-CRITERIA.md` and report pass/fail for each.

## 9. Git

- Commit after each completed task with Conventional Commits: `type(scope): summary`, e.g. `feat(sales): add void endpoint (BR-24)`, `fix(pos): cap line discount (BR-14)`, `docs(schema): add purchases table`.
- One branch per phase (`phase-7-pos`); merge to `main` through a PR with CI green.
- Never commit `.env`, uploads, database dumps or real customer data. Never force-push `main`.

## 10. After every task

Update `docs/13-MEMORY.md`:
- Tick the task in `docs/10-PHASES.md` and update the phase status table in Memory.
- Add a session-log line (date — what was done — what's next).
- Record any decision (next `D-xx` number), spec change or known issue.

## 11. Commands

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Start database | `docker compose up -d db` |
| Dev (web + api) | `pnpm dev` |
| Migrate (dev) | `pnpm --filter api db:migrate` |
| Seed | `pnpm --filter api db:seed` |
| Reset DB (dev only) | `pnpm --filter api db:reset` |
| Unit + API tests | `pnpm test` |
| E2E tests | `pnpm --filter web e2e` |
| Lint | `pnpm lint` |
| Type-check | `pnpm typecheck` |
| Build | `pnpm build` |

Create these scripts in Phase 0 exactly as named.
