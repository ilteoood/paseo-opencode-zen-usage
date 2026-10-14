# Map: Per-org watchlist for OpenCode Zen usage

Label: `wayfinder:map`
Created: 2026-10-14 (round 6)

## Destination

A per-user Workspace watchlist that gates which OpenCode Zen orgs surface as `UsageAccount`s. Settled on the existing connect screen, persisted in `selection.json` next to `cred.json`, auto-seeded from `/api/orgs` on first connect, edited via an explicit Apply button.

When this map closes, the day's first run shows every workspace, unchecking one and pressing Apply narrows the usage card to the rest, and that choice survives reconnect.

## Notes

- Domain: Paseo usage-source plugin for OpenCode Zen monthly budgets. Existing behaviour documented in `README.md`.
- Plugin contract: Paseo `>=0.11.0`; the `UsageAccount`/`UsageReport` shapes already in `server/usage.ts`.
- Files in scope, do not refactor beyond what's needed for the watchlist:
  - `server/usage.ts` — current `UsageSourceRegistration`.
  - `server/auth.ts` — device-flow orchestration.
  - `server/cred.ts` — credential load/save/clear.
  - `server/plumbing.ts` — fetch + token refresh.
  - `client/connect.tsx` — current connect screen.
  - `shared/schema.ts`, `shared/connect.ts` — zod schemas and RPC contracts.
- Round-5 endpoint pivot is **uncommitted** on disk: `server/types.ts` and `server/usage.ts` switched from `/api/v1/budgets/members` (admin) to `/api/policies/current-budgets` (per-user). The watchlist sits on top — do not re-churn the new surface.
- Skills every implementation session should consult: `ponytail` (lazy senior dev), `thermos` (self-review), `ponytail-review` (over-engineering check), `git-commit` (commits), `git-flow-branch-creator` (branching).
- Style per `AGENTS.md`: descriptive names, no explanatory inline comments.
- Test pattern (existing): mocked `globalThis.fetch`, `XDG_DATA_HOME` pointed at a tempdir.

## Decisions so far

- **What does "choose which org" mean semantically?** — per-org opt-in watchlist: toggles in the connect screen, only opted-in orgs become `UsageAccount`s.
- **Where does the choice persist?** — `selection.json` (mode `0600`) in `$XDG_DATA_HOME/paseo-opencode-zen-usage/`, alongside `cred.json`.
- **When does the user make the choice?** — on the existing connect screen, after device-flow connect.
- **First-run state when `selection.json` is missing?** — auto-watch all orgs from `/api/orgs` and persist.
- **Save UX for toggles?** — explicit Apply button: toggles stage locally; one write on Apply.
- **Org-list source for the picker?** — new `listWorkspaces` RPC returns `[{ id, name, selected }]` from `/api/orgs`. The existing workspace-count badge on the Status section stays.

### Closed tickets

- [Server: selection storage, listWorkspaces RPC, discover filter, auto-seed](tickets/01-server-selection-and-discover-filter.md) (commit `06ac4d5`): `selection.json` (mode `0600`, atomic write) + `ensureSeeded` idempotent first-run auto-seed + `listAccounts = selection ∩ /api/orgs` + `listWorkspacesForUsage` + `listWorkspacesRpc` + `saveSelectionRpc`. 16 new tests; existing 34 regression-free.
## Not yet specified

Fog toward the destination. Each item is specifiable on demand; nothing here is sharp enough to be a ticket yet.

- Apply-button visual state machine: `Apply` vs `Apply (N)` label, disabled-when-zero-changes, busy spinner while writing, error surface on write failure.
- Sort order of orgs in the picker (default: by `id`, deterministic; not yet decided).
- Empty `/api/orgs` response handling: hide the picker, surface a "no workspaces" line, or a different affordance.
- Disconnect behaviour for `selection.json` (covered by ticket "Selection behavior on disconnect").
- Picker section heading copy ("Workspaces" vs "Workspace watchlist").
- Behaviour when the OAuth token no longer lists a previously-selected org (intersect on every discover; no explicit invalidation UI).

## Out of scope

- Per-org device-flow sign-in (one shared device-flow connect across workspaces).
- Schema break of `usageAccountInputSchema` — stays `{ workspaceId }`.
- Background re-fetch of `/api/orgs` outside the existing 5-minute Discover cadence.
- Optimistic local edits on the picker (was explicitly rejected: Apply is one write).
- Paseo-side concerns for how it re-renders discovered accounts when the list shape changes — owned by the host.

## Tickets

| ID | Title | Type | Blocked by |
| --- | --- | --- | --- |
| 01 | Server: selection storage, listWorkspaces RPC, discover filter, auto-seed | task (AFK) | — |
| 02 | Connect-screen workspace picker prototype | prototype (HITL) | 01 |
| 03 | Selection behavior on disconnect | task (AFK) | — |
| 04 | README and final verification | task (AFK) | 01, 02, 03 |

Frontier tickets on session restart: 01, 03 (open and unblocked). 02 and 04 unblock as their prerequisites close.
