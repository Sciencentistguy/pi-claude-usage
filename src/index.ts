import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const BAR_WIDTH = 50;
const EIGHTHS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];

interface Window {
	utilization: number | null;
	resets_at: string | null;
}

interface ExtraUsage {
	is_enabled: boolean;
	monthly_limit: number | null;
	used_credits: number | null;
	utilization: number | null;
	currency?: string | null;
}

type WindowKey = "five_hour" | "seven_day" | "seven_day_opus" | "seven_day_sonnet";

type UsageResponse = Partial<Record<WindowKey, Window | null>> & {
	extra_usage?: ExtraUsage | null;
};

const SECTIONS: [WindowKey, string][] = [
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

function formatMinorUnits(amount: number, currency: string): string {
	const format = new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "narrowSymbol" });
	const { maximumFractionDigits = 2 } = format.resolvedOptions();
	return format.format(amount / 10 ** maximumFractionDigits);
}

function startOfNextMonth(): string {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
}

function renderExtraUsage(extra: ExtraUsage, bold: (s: string) => string, dim: (s: string) => string): string[] {
	const title = "Usage credits";
	if (!extra.is_enabled || extra.used_credits == null) return [];
	const currency = extra.currency?.toUpperCase() ?? "USD";
	const spent = formatMinorUnits(extra.used_credits, currency);
	if (extra.monthly_limit == null) return [bold(title), `${spent} spent`];
	const utilization =
		extra.utilization ??
		(extra.monthly_limit > 0 ? (extra.used_credits / extra.monthly_limit) * 100 : 100);
	const [heading, barLine, reset] = renderSection(
		title,
		{ utilization, resets_at: startOfNextMonth() },
		bold,
		dim,
	);
	return [heading, `${barLine}  ${dim(`(${spent} / ${formatMinorUnits(extra.monthly_limit, currency)} spent)`)}`, reset];
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

export default function (pi: ExtensionAPI) {
	pi.registerCommand("usage", {
		description: "Show Claude subscription usage limits",
		handler: async (_args, ctx) => {
			let usage: UsageResponse;
			try {
				const token = await ctx.modelRegistry.getApiKeyForProvider("anthropic");
				if (!token) throw new Error("Not logged in to Anthropic; run `/login`");
				usage = await fetchUsage(token, ctx.signal);
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
				return;
			}

			await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
				const bold = (s: string) => theme.bold(s);
				const dim = (s: string) => theme.fg("dim", s);
				const lines: string[] = [];
				for (const [key, title] of SECTIONS) {
					const window = usage[key];
					if (!window || window.utilization == null) continue;
					if (lines.length) lines.push("");
					lines.push(...renderSection(title, window, bold, dim));
				}
				const extra = usage.extra_usage ? renderExtraUsage(usage.extra_usage, bold, dim) : [];
				if (extra.length) {
					if (lines.length) lines.push("");
					lines.push(...extra);
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
