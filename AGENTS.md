# pi-claude-usage

Pi extension (`src/index.ts`) registering `/usage`. Uses the Anthropic OAuth token from pi's model registry
(`getApiKeyForProvider("anthropic")`, must be an `sk-ant-oat` subscription token) to call
`GET https://api.anthropic.com/api/oauth/usage` (header `anthropic-beta: oauth-2025-04-20`) and renders
`five_hour`, `seven_day`, `seven_day_sonnet`, `seven_day_opus` windows as bars.
Install: `pi install /path/to/pi-claude-usage`.
