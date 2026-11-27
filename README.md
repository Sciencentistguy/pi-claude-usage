# pi-claude-usage

A [pi](https://github.com/earendil-works/pi) extension that adds a `/usage` command showing your Claude subscription usage limits GitHub Copilot AI credit usage and DeepSeek account balance. It is a companion to [pi-claude-code](https://github.com/earendil-works/pi-claude-code).

## Install

```sh
pi install git:github.com/Sciencentistguy/pi-claude-usage
```

## Usage

Run `/usage` inside pi. It renders a bar for each usage window:

- `five_hour`
- `seven_day`
- `seven_day_sonnet`
- `seven_day_opus`

If usage credits (extra usage) are enabled, it also shows credit spend against the monthly limit, or total spend when there's no limit. On enterprise accounts this is the only form of usage.

`/usage` shows every provider you're logged in to; use `/usage claude` or `/usage copilot` / `/usage deepseek` to pick one.

For GitHub Copilot it renders AI credits used against the monthly allowance (1 credit = $0.01), or just credits used for pooled/unlimited org allowances.

For DeepSeek it shows the remaining balance (topped-up and granted) per currency.

## Authentication

The extension uses pi's stored Anthropic login; sign in with `/login` first.

It calls `GET https://api.anthropic.com/api/oauth/usage` with the header `anthropic-beta: oauth-2025-04-20`.

For Copilot, the GitHub OAuth token from pi's `github-copilot` login (falling back to `gh auth token`) is used to call the undocumented `GET https://api.github.com/copilot_internal/user` and read `quota_snapshots.premium_interactions`.

For DeepSeek, pi's configured `deepseek` API key is used to call `GET https://api.deepseek.com/user/balance`.

## Licence

[MPL-2.0](LICENCE)
