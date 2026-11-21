# pi-claude-usage

Pi extension (`src/index.ts`) registering `/usage`, companion to earendil-works/pi-claude-code. Uses the Claude Code OAuth token from `$CLAUDE_CONFIG_DIR/.credentials.json` (default `~/.claude`, `claudeAiOauth.accessToken`; not pi's own login) to call
`GET https://api.anthropic.com/api/oauth/usage` (header `anthropic-beta: oauth-2025-04-20`) and renders
`five_hour`, `seven_day`, `seven_day_sonnet`, `seven_day_opus` windows as bars.
Install: `pi install /path/to/pi-claude-usage`.
