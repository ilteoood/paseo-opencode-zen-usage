# Ticket 04: README and final verification

Parent: [map](../map.md)
Type: `wayfinder:task` (AFK)
Status: open, blocked by tickets 01, 02, 03

## Question

Close out the effort:

1. Update `README.md`:
   - Add a "Workspace watchlist" subsection under "How it works": where the choice lives (`selection.json`), how to change it (connect screen → Apply), day-one auto-seed rule.
   - Update "Discover": from "every workspace you belong to" to "every watched workspace (intersected with `/api/orgs` on each refresh)".
   - Update "Identity" if needed: account key still `sha256(workspaceId:opencode:<email|sub>)`, stable across re-opt-in.
   - Update "What's missing on purpose": add the explicit Apply flow, the auto-seed-once rule, the disconnect-keeps-selection (or clears, per ticket 03) decision.
   - Update "Layout" to add `server/selection.ts` and the new RPC name.
2. Run `bun run typecheck`.
3. Run `bun test`. All new tests pass; the round-5 endpoint pivot's 34 tests still pass.
4. Inspect `git diff` to make sure no stray style churn on top of the round-5 uncommitted changes.

### Files touched

- `README.md`
- (Possibly) `shared/schema.ts`, `shared/connect.ts` for minor callouts if the in-doc zod schemas drifted.

### Skills to load at session start

`ponytail`, `git-commit`.

## Closes when

- README updated, `bun run typecheck` clean, `bun test` green, diff is minimal.
