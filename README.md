# pi-claude-usage

A [pi](https://github.com/earendil-works/pi) extension that adds a `/usage` command showing your Claude subscription usage limits. It is a companion to [pi-claude-code](https://github.com/earendil-works/pi-claude-code).

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

## Authentication

The extension uses the Claude Code OAuth token (`claudeAiOauth.accessToken`) from
`$CLAUDE_CONFIG_DIR/.credentials.json`, defaulting to `~/.claude/.credentials.json`. Pi's own login is not used, so sign in with Claude Code first.

It calls `GET https://api.anthropic.com/api/oauth/usage` with the header `anthropic-beta: oauth-2025-04-20`.

## Licence

[MPL-2.0](LICENCE)
