# OpenCode Zen Usage
What this plugin is

Adds an OpenCode Zen usage source to Paseo. Sign in with OpenCode and the
plugin reports your monthly Zen spend for every workspace you belong
to, rendered as a usage card inside Paseo.

How it works

Connect through OpenCode's device-flow OAuth. After approval the plugin
reads your email and sub claim from the access token JWT, lists your
workspaces via /api/orgs, and turns the workspaces you keep on the
watchlist into UsageAccount entries. For each one it calls
/api/policies/current-budgets and reports every matching budget policy
as a UsageWindow in USD with used, limit, and remaining.

Setup

Open the Connect OpenCode Zen item from Command Center and complete the
device-flow sign in. Once the status shows connected, use the watchlist
picker that the screen reveals to choose which workspaces contribute a
card. Requires Paseo 0.11 or newer on the daemon.

What it reads and where

Reads your OpenCode email and sub claim from the device-flow access
token, lists your workspaces from /api/orgs, and fetches each watched
workspace's budget policies from /api/policies/current-budgets. Stores
the refreshed credential at
$XDG_DATA_HOME/paseo-opencode-zen-usage/cred.json with file mode 0600
and the workspace watchlist at
$XDG_DATA_HOME/paseo-opencode-zen-usage/selection.json with the same
mode. Every API call goes to opencode.ai/console.

Known limits

An empty response or a 403 from /api/policies/current-budgets surfaces
as unavailable with reason no_quota so the daemon can offer a remedy.
Tokens refresh when within 60 s of expiry. Discover runs every five
minutes and the SDK caches reports for the same window, so freshly
reflected budget totals appear after that interval. The watchlist seeds
itself with every workspace on first read, so opting in is the default
and opting out is explicit. The connect screen keeps the device-flow
state in memory, so closing the screen mid-flow drops it. Disconnect
keeps the watchlist, so reconnecting reuses your previous selection and
only adds workspaces that have appeared since.
