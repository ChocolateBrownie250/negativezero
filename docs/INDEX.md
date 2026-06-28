# Docs index

A reading-order map of the `docs/` folder for the `negativezero` platform. Each
entry has a one-line description. Start at the top and read down; the first
group is the working memory you should read before any substantive change.

For the repo-level entry points outside this folder, see
[`../README.md`](../README.md), [`../HANDOVER.md`](../HANDOVER.md),
[`../AGENTS.md`](../AGENTS.md), and [`../CONTRIBUTING.md`](../CONTRIBUTING.md).

## Read first — working memory

1. [`CLAUDE.md`](CLAUDE.md) — the entry point Claude Code auto-loads; orients an
   agent and points at the working-memory files.
2. [`ARCHITECTURE.md`](ARCHITECTURE.md) — how the platform is built: stack,
   components, URL layout, auth model, per-service data, deployment topology.
3. [`PLAN.md`](PLAN.md) — the live phased plan and execution log; read this to
   see what's in progress and what's next.
4. [`DECISIONS.md`](DECISIONS.md) — append-only log of architectural decisions,
   alternatives, and what would invalidate each choice (most recent on top).

## Operating the platform

5. [`DEPLOY.md`](DEPLOY.md) — self-contained runbook for deploying the current
   `main` to the production VPS from a machine with the deploy key.
6. [`RUNBOOK.md`](RUNBOOK.md) — operator procedures: invite a user, rotate a
   passkey or API key, inspect state, recover a stuck deploy.

## Accounts & authorization

7. [`ACCOUNTS_PLAN.md`](ACCOUNTS_PLAN.md) — the design for the multi-account,
   per-service authorization model centered on `admin`.
8. [`ACCOUNTS_PROGRESS.md`](ACCOUNTS_PROGRESS.md) — living progress log for the
   accounts/authorization implementation.
9. [`AUTH_AUDIT_2026-06-19.md`](AUTH_AUDIT_2026-06-19.md) — point-in-time audit
   of the authorization and account system, with findings and fixes.

## Service deep-dives

10. [`CITRINE_IMPLEMENTATION_REPORT.md`](CITRINE_IMPLEMENTATION_REPORT.md) —
    status report for Citrine (the presentation builder at `/services/citrine/`).
11. [`presentation-studio-progress.md`](presentation-studio-progress.md) —
    detailed implementation progress and decisions for the Citrine service
    (`apps/presentation-studio/`).

## Engineering-hardening docs (added separately)

These are being created by sibling PRs in the same hardening pass and are not
yet present on this branch, so they are listed as paths rather than links:

- `docs/SYSTEM_DESIGN.md` — *added separately* — system-design overview of the
  platform.
- `docs/DESIGN_SYSTEM.md` — *added separately* — shared UI/design-system
  conventions across the services.
- `docs/TESTING_STRATEGY.md` — *added separately* — testing approach and
  coverage expectations per stack.
- `docs/TECH_DEBT.md` — *added separately* — tracked technical debt and
  cleanup backlog.
