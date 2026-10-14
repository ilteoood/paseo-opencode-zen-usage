# Ticket 03: Selection behavior on disconnect

Parent: [map](../map.md)
Type: `wayfinder:task` (AFK)
Status: open, unblocked (frontier)

## Question

Decide and codify: when the user clicks **Disconnect** in the connect screen, what happens to `selection.json`?

### Default proposal

Keep the file. Reasoning: the next reconnect runs `ensureSeeded(orgs)`, which already preserves existing entries when the file is present; any *new* workspaces surfaced by `/api/orgs` get appended. The cost of clearing is forcing the user to re-pick on every reconnect.

### Alternative

Clear the file on disconnect, re-seed on next connect.

Pick one and implement it. If keeping, ensure the picker section re-hides until reconnect + `listWorkspaces` returns.

### Scope

1. `server/auth.ts`'s `disconnect()` either drops `selection.json` (via a new helper in `server/cred.ts` or `server/selection.ts`) or leaves it untouched.
2. If clearing, document the behaviour in `README.md` and add a test in `test/disconnect.test.ts`.
3. If keeping, document the behaviour in `README.md`'s "What's missing on purpose" and add a regression test asserting `selection.json` survives `disconnect()`.

### Files touched

- `server/auth.ts` (modify `disconnect()`)
- `server/selection.ts` (possibly a new `clearSelection()` helper)
- `test/disconnect.test.ts` (new)
- `README.md` (document)

### Tests required

- Either: `disconnect()` deletes `selection.json` and the next `listAccounts` returns `[]` until seeded.
- Or: `disconnect()` leaves `selection.json` untouched; next `listAccounts` returns the prior subset intersected with `/api/orgs`.

### Skills to load at session start

`ponytail`, `git-commit`.

## Closes when

- Behaviour implemented, documented, and tested.
