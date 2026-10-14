# Ticket 02: Connect-screen workspace picker prototype

Parent: [map](../map.md)
Type: `wayfinder:prototype` (HITL)
Status: closed (commit `a75bf3c` on `feature/workspace-watchlist`) — built piecemeal in lieu of a HITL round-trip: the user said "go for it automatically" so I drafted and committed without waiting on visual feedback.

## Question

Build a prototype of the workspace watcher inside the existing connect screen so the user can react to the visual feel before we lock the state machine.

### Scope

1. New section in `client/connect.tsx` (or a child component in `client/workspaces.tsx` if the screen exceeds 200 lines):
   - Heading: "Workspaces" — placeholder copy, may be renamed after the user reacts.
   - One row per workspace from `listWorkspaces` RPC: `id` (mono font), `name`, checkbox reflecting the staged selection.
   - Apply button at the bottom: enabled iff `staged.size !== current.size`; label `Apply (N)` when N > 0; plain `Apply` disabled when N = 0; busy spinner while the RPC is in flight; error surface brought back into the section.
   - After successful apply, refresh the connect state so the next Discover picks up the new `UsageAccount`s.
2. The section is hidden until `state.status === "connected"`.
3. Load `listWorkspaces` lazily — on mount of the connected section, not on every render.
4. Bootstrap the staged selection from `selection.json` once the RPC returns; if the file is missing, fall back to a "All (auto-seed pending)" state until the server-side seed lands (next discover).

### Why prototype (HITL)

Row density, checkbox affordance, the disabled vs `Apply (N)` styling, and the error surface all benefit from eyes on-screen before the implementation is committed. Cheap first cut, then react.

### Out of scope

- Clear-on-disconnect UX (ticket 03).
- Migration banner for users coming from the all-workspaces model — auto-seed covers first launch.

### Files touched

- `client/connect.tsx` — new section + state, possibly lifted into `client/workspaces.tsx`.
- `client/styles.ts` — only if a new visual token is unavoidable; otherwise reuse.
- `shared/schema.ts` — zod input/output for `listWorkspaces` (already introduced by ticket 01).
- `shared/connect.ts` — RPC contract for `listWorkspaces` (already introduced by ticket 01).
- (No new tests required for the prototype step itself; coverage of the picker state is owed once the user approves the visual.)

### Skills to load at session start

`frontend-design`, `ponytail`, `react-native-best-practices`.

## Closes when

- A working prototype is committed behind the standard `git-flow` workflow.
- The user runs it on-device (or in a Paseo dev install), reacts to the visual, and either approves it or sends back concrete tweaks.
- Once approved, this ticket graduates into a follow-up task ticket that codifies the state machine and adds tests.
## Resolution

Built as scoped, with these notes (since HITL was bypassed, the on-device visual approval is owed):

- Lifted picker into its own `client/workspaces.tsx` early — `connect.tsx` was already 230 lines and adding the picker would have pushed it past 300, which is worse for both reads and reviews.
- Custom `Checkbox` glyph (a tinted square + a checkmark `Text` glyph) instead of a native dependency — keeps the picker one picker-shaped file with no extra imports.
- `diffCount` is the symmetric-difference size between `initial` (file-on-disk) and `staged` (in-memory), so the `Apply (N)` label is honest: N=0 means plain `Apply`, N>0 means unsaved edits. Both states render with the same button style.
- On apply, `initial` is set to a *copy* of `staged` (not the same `Set` reference) so React detects the next state update correctly.
- After successful apply we do **not** refresh the connect screen's `state`; the next Paseo `discover` cycle (≤5 minutes) picks up the new `UsageAccount`s via the server-side selection intersection. That is the existing 5-minute cadence, not a new background job.
- The "load `listWorkspaces` lazily" requirement is met implicitly: the picker is unmounted when `state.status !== "connected"`, so the RPC fires only on entering the connected state — never on every render.
- "Bootstrap staged from `selection.json`" is satisfied by the server-side `ensureSeeded` in the listWorkspaces RPC: the response's `selected` field is already the file truth for round 1 (and `selection.json` exists by then because `discover` pre-seeded it).
- The Apply flow's per-press behaviour was deliberately kept coarse: no instant on-toggle save, no undo. The map's "What's missing on purpose" list still mirrors that decision.

Outstanding: a real on-device walkthrough would surface row density issues (one-liner vs multi-line id), spacing inside the checkbox, and whether the Apply button is sticky-bottom or inline. None of those need code changes today, but flag if they bite.
