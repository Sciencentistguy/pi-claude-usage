import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const BAR_WIDTH = 50;
const EIGHTHS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];

interface Window {
	utilization: number | null;
	resets_at: string | null;
}

interface UsageResponse {
	five_hour?: Window | null;
	seven_day?: Window | null;
	seven_day_opus?: Window | null;
	seven_day_sonnet?: Window | null;
}

const SECTIONS: [keyof UsageResponse, string][] = [
	["five_hour", "Current session"],
	["seven_day", "Current week (all models)"],
	["seven_day_sonnet", "Current week (Sonnet only)"],
	["seven_day_opus", "Current week (Opus only)"],
];

function bar(percent: number): string {
	const eighths = Math.round((Math.min(100, Math.max(0, percent)) / 100) * BAR_WIDTH * 8);
	const full = Math.floor(eighths / 8);
	return "█".repeat(full) + EIGHTHS[eighths % 8];
}

function formatReset(iso: string): string {
	const date = new Date(iso);
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const time = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })
		.format(date)
		.replace(" ", "");
	const sameDay = date.toDateString() === new Date().toDateString();
	const day = sameDay
		? ""
		: `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date)}, `;
	return `Resets ${day}${time} (${timeZone})`;
}

function renderSection(title: string, window: Window, bold: (s: string) => string, dim: (s: string) => string): string[] {
	const percent = Math.round(window.utilization ?? 0);
	const label = `${percent}% used`;
	const bars = bar(percent).padEnd(BAR_WIDTH);
	return [
		bold(title),
		`${bars}  ${label}`,
		window.resets_at ? dim(formatReset(window.resets_at)) : "",
	];
}

async function fetchUsage(token: string, signal?: AbortSignal): Promise<UsageResponse> {
	const response = await fetch(USAGE_URL, {
		signal,
		headers: {
			Authorization: `Bearer ${token}`,
			"anthropic-beta": "oauth-2025-04-20",
			"Content-Type": "application/json",
		},
	});
	if (!response.ok) throw new Error(`Usage request failed: ${response.status} ${response.statusText}`);
	return (await response.json()) as UsageResponse;
}

async function claudeCodeToken(): Promise<string> {
	const configDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
	let oauth: { accessToken?: string; expiresAt?: number } | undefined;
	try {
		oauth = JSON.parse(await readFile(join(configDir, ".credentials.json"), "utf8")).claudeAiOauth;
	} catch {
		throw new Error("Claude Code credentials not found; run `claude auth login`");
	}
	if (!oauth?.accessToken) throw new Error("Claude Code is not logged in with a subscription; run `claude auth login`");
	if (oauth.expiresAt && oauth.expiresAt < Date.now()) {
		throw new Error("Claude Code token has expired; run `claude` once to refresh it");
	}
	return oauth.accessToken;
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("usage", {
		description: "Show Claude subscription usage limits",
		handler: async (_args, ctx) => {
			let usage: UsageResponse;
			try {
				usage = await fetchUsage(await claudeCodeToken(), ctx.signal);
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
				return;
			}

			await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
				const lines: string[] = [];
				for (const [key, title] of SECTIONS) {
					const window = usage[key];
					if (!window || window.utilization == null) continue;
					if (lines.length) lines.push("");
					lines.push(...renderSection(title, window, (s) => theme.bold(s), (s) => theme.fg("dim", s)));
				}
				if (!lines.length) lines.push("No usage data returned.");
				lines.push("", theme.fg("dim", "Press any key to dismiss"));
				return {
					render: () => lines.map((line) => `  ${line}`),
					invalidate: () => {},
					handleInput: () => done(),
				};
			});
		},
	});
}
