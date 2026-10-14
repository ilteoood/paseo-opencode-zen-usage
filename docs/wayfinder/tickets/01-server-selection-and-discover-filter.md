# Ticket 01: Server — selection storage, listWorkspaces RPC, discover filter, auto-seed

Parent: [map](../map.md)
Type: `wayfinder:task` (AFK)
Status: closed (commit `06ac4d5` on `feature/workspace-watchlist`)

## Question

Wire the server side of the watchlist so the picker has authoritative data and `listAccounts` only surfaces opted-in orgs.

### Scope

1. New module `server/selection.ts`:
   - `loadSelection()` reads `$XDG_DATA_HOME/paseo-opencode-zen-usage/selection.json`; returns `null` if missing, throws if shape is wrong.
   - `saveSelection(workspaceIds)` writes atomically (tmp file + rename), mode `0600`.
   - `ensureSeeded(orgs)` seeds `selection.json` with `orgs` only if the file is absent; returns the resulting ids.
2. New RPC `listWorkspaces` registered in `index.server.ts`: returns `Array<{ id: string; name: string }>` from `/api/orgs`, reusing the existing `fetchOrganizations` helper in `server/usage.ts`.
3. New RPC contract `listWorkspacesRpc` in `shared/connect.ts` with a zod input/output schema in `shared/schema.ts`.
4. `listAccounts` in `server/usage.ts`: load `selection.json`, intersect with `/api/orgs`. Skip orgs in the file that don't appear in `/api/orgs` (silent drop; covered by ticket 03 for UI surfacing).
5. Auto-seed is a single side-effect at most once: write only when the file is absent. Subsequent `listAccounts` calls read but never auto-write.

### Out of scope

- Client UI (covered by ticket 02).
- Clear-on-disconnect behaviour (covered by ticket 03).

### Files touched

- `server/selection.ts` (new)
- `server/usage.ts` (filter in `listAccounts`)
- `index.server.ts` (new `listWorkspaces` handler)
- `shared/schema.ts` (zod for `Selection`)
- `shared/connect.ts` (RPC contract)
- `test/selection.test.ts` (new — load/save round trip; intersect; auto-seed-once; missing-file; corrupt-file)
- `test/usage.test.ts` (extend: discover returns empty when selection.json present but no overlap; returns matched subset otherwise)

### Tests required

- `loadSelection()` returns `null` when the file is absent.
- `saveSelection()` followed by `loadSelection()` round-trips equal sets (order-independent).
- `saveSelection()` writes mode `0600`.
- `ensureSeeded({a,b})` writes a new file with `{a,b}`; second call with `{a,b,c}` does NOT overwrite.
- `listAccounts` returns `[]` when `selection.json` exists but `/api/orgs` returns no overlap.
- `listAccounts` returns only the overlap when both sides are present.
- Failures throw cleanly (corrupt JSON, unwritable dir).

### Skills to load at session start

`ponytail`, `git-flow-branch-creator`, `git-commit`.

## Closes when

- `bun run typecheck` clean.
- New tests pass; the existing 34 tests still pass (no regression on the round-5 endpoint pivot in uncommitted state).
- Diff is minimal: no churn on `server/auth.ts`, no churn on `client/*` files, only the listed files touched.
## Resolution

Built as scoped. Notable refinements versus the plan (all backward-compatible):

- `listWorkspacesForUsage` returns `[{ id, name, selected }]` rather than `[{ id, name }]` so the picker gets current selection state in one round trip.
- `orgs` extracted to a new `server/orgs.ts` module — both `usage.ts` and the new RPC consume it.
- `hydrateWorkspaceCount` lost its `wantsCount` flag (dead arg — every caller wanted it).
- `index.server.ts`'s `listWorkspaces` handler returns `{ entries: [] }` on credential missing or fetch failure so the picker can render an empty state without throwing.
