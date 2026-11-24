# pi-claude-usage

Pi extension (`src/index.ts`) registering `/usage`, companion to earendil-works/pi-claude-code. Uses pi's stored Anthropic login via `ctx.modelRegistry.getApiKeyForProvider("anthropic")` (handles refresh) to call
`GET https://api.anthropic.com/api/oauth/usage` (header `anthropic-beta: oauth-2025-04-20`) and renders
`five_hour`, `seven_day`, `seven_day_sonnet`, `seven_day_opus` windows as bars, plus `extra_usage` (usage credits; amounts in currency minor units,
monthly reset; the only usage form on enterprise accounts) when `is_enabled`.
Install: `pi install /path/to/pi-claude-usage`.
