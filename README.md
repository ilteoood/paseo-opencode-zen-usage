# paseo-opencode-zen-usage

OpenCode Zen monthly budget card in Paseo.

A [Paseo](https://paseo.sh) usage-source plugin (`>=0.11.0`) that signs you in
with the OpenCode device-flow OAuth and reports your monthly Zen spend across
every workspace you belong to. Account identity is read from the JWT the
console hands back, so each card shows your own row, not the workspace total.

## Install

```sh
paseo plugin add <owner>/paseo-opencode-zen-usage
```

Requires Paseo 0.11+ on the daemon.

## How it works

1. **Connect** — open the `Connect OpenCode Zen` Command Center item. The
   plugin runs `/auth/device/code` against `https://opencode.ai/console` and
   shows the verification URL plus the user code. Approve in the browser.
2. **Persist** — on approval the plugin exchanges the device code for a token,
   decodes `email` out of the access_token JWT, writes the credential to
   `$XDG_DATA_HOME/paseo-opencode-zen-usage/cred.json` (mode `0600`).
3. **Discover** — every five minutes the daemon calls `discover`, which lists
   your workspaces via `/api/orgs` and emits one `UsageAccount` per workspace
   (`harness: "opencode"`, `label: "Workspace — email@example.com"`).
4. **Fetch** — `fetch({ workspaceId })` calls
   `https://opencode.ai/console/api/v1/budgets/members` with the
   `x-org-id: <workspace>` header. The row matching the JWT `email` becomes a
   `UsageWindow` (`Monthly budget`, `usedPct = spent / limit`) and matching
   `UsageBalance` in USD cents. Tokens are transparently refreshed when within
   60 s of expiry.

   When the console returns a row whose `limit_micro_cents` is `null` and
   whose `source` is `null` the member is unlimited and the card shows
   `unavailable { no_quota }`. A `403` becomes
   `unavailable { rejected }` so the daemon can offer a remedy.

## Data model

**Inputs** — `usageAccountInputSchema = { workspaceId: string }` (strict).
Workspace IDs come from `/api/orgs` and stay opaque to the daemon; only the
plugin reads them.

**Identity** — derived from the access_token JWT (`email`, `sub`).
`account.key = sha256(workspaceId:opencode:<email|sub>)` per Hosting SDK
contract. Same identity across rotations.

**Reports** — one `UsageWindow` (`Monthly budget`, short label `mo`, marked
`summary: true`) and one `UsageBalance` (USD, with `used` / `limit` /
`remaining` derived from `*_micro_cents`), plus an optional `UsageDetail`
when `member.exceeded === true`.

## What's missing on purpose

- The connect screen uses a single in-memory `current` device-flow state.
  Closing the in-app screen drops it; reopening calls `status` and shows
  "Not connected" until the user starts a new flow.
- No background job — refresh rides on every usage-modal open. The SDK
  caches reports for 5 minutes; we don't pre-warm.
- Self-identity depends on a JWT `email`/`sub` claim. The Console API has
  no documented `/api/me`; if a future build stops embedding the email in
  the token, the adapter falls back to a workspace-total `UsageReport`
  with `planLabel: "Workspace total"`.

## Layout

```
paseo-plugin.json          id, requirement >=0.11.0
index.server.ts            registers usage source + connect RPCs
index.client.tsx           registers screen + Command Center item
client/connect.tsx         device-flow UI
client/styles.ts           themed stylesheet over PluginTheme
server/usage.ts            UsageSourceRegistration
server/auth.ts             device flow orchestration
server/cred.ts             credential load / save / clear (XDG)
server/plumbing.ts         fetch + token refresh
server/types.ts            response interfaces
shared/schema.ts           zod schemas (usage input, connect state)
shared/connect.ts          RPC contracts for the four device-flow transitions
test/                      bun test suite with mocked globalThis.fetch
```

## Tests

```sh
bun install
bun run typecheck
bun test
```

The suite mocks `globalThis.fetch`, points `XDG_DATA_HOME` at a tempdir, and
exercises every transition: device start, slow_down, denied, expired, the
rotate-and-store refresh path, member-vs-identity matching, and the 401/403
mapping.

## License

MIT — Copyright (c) 2025 Matteo Pietro Dazzi.
