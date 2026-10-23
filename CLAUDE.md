# POS SYSTEM

Multi-tenant POS and GST SaaS for Bhutanese grocery stores, restaurants and cafés, built by Yuevaán IT Consultancy. A production rebuild (React + Node + PostgreSQL) of the browser-only prototype in `prototype/`.

This project is spec-driven. The specs in `docs/` are the source of truth.

## Every session

1. Read `docs/12-RULES.md` and `docs/13-MEMORY.md`.
2. Read the docs for the current task (see `docs/README.md` → Reading order).
3. Work only on the current phase in `docs/10-PHASES.md`.
4. When done, update `docs/13-MEMORY.md`.

## Never

- Build features that aren't in the docs or are listed as out of scope (`docs/01-PRD.md` §7)
- Edit or deploy anything in `prototype/` — it's a read-only behavior reference
- Compute money, tax or discounts outside `packages/shared/src/money`
- Read `businessId` from a request instead of the session, or skip a permission check
- Commit secrets or edit `.env` files
- Change the database schema without a migration and an update to `docs/06-BACKEND-SCHEMA.md`
- Guess when docs are unclear or conflict — ask instead

## Commands

- Install: `pnpm install`
- Database: `docker compose up -d db`
- Dev: `pnpm dev`
- Test: `pnpm test`
- Lint: `pnpm lint`
- Type-check: `pnpm typecheck`
