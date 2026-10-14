# Ticket 04: README and final verification

Parent: [map](../map.md)
Type: `wayfinder:task` (AFK)
Status: closed (commit `beaccdb` on `feature/workspace-watchlist`)

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
## Resolution

Closed as scoped:

- README: added a `Workspace watchlist` section under "How it works" with the file location, first-run auto-seed, Apply UX, and the disconnect-keeps-selection decision. Discover bullet now mentions the intersection. Layout block gained `server/selection.ts`, `server/orgs.ts`, and `client/workspaces.tsx`. Tests paragraph reflects the current suite (no `member-vs-identity` claim, includes storage + intersection + disconnect-survival assertions).
- Typecheck (`bun run typecheck`) clean.
- Tests (`bun test`) — 51 pass / 0 fail across 4 files; 16 server tests (11 storage + 5 watchlist) + 1 client-side regression test for the disconnect-survival path.
- Diff sanity: every commit on the branch stays in its lane — round-5 fix, wayfinder maps, server module + tests, picker UI, disconnect regression, README. No churn spilled onto unrelated files.
