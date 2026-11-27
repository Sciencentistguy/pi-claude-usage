import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const run = promisify(execFile);

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

function renderClaude(usage: UsageResponse, bold: Styler, dim: Styler): string[] {
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
	return lines;
}

interface QuotaSnapshot {
	entitlement?: number | null;
	remaining?: number | null;
	percent_remaining?: number | null;
	credits_used?: number | null;
	unlimited?: boolean;
	has_quota?: boolean;
}

interface CopilotResponse {
	copilot_plan?: string;
	quota_reset_date?: string | null;
	quota_reset_date_utc?: string | null;
	quota_snapshots?: { premium_interactions?: QuotaSnapshot | null };
}

type Styler = (s: string) => string;

async function copilotCredentials(): Promise<{ token: string; apiBase: string }> {
	let token: string | undefined;
	let apiBase = "https://api.github.com";
	try {
		const auth = JSON.parse(await readFile(join(getAgentDir(), "auth.json"), "utf8"));
		const credential = auth["github-copilot"];
		if (credential?.type === "oauth" && typeof credential.refresh === "string") {
			token = credential.refresh;
			if (credential.enterpriseUrl) {
				const domain = String(credential.enterpriseUrl).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
				apiBase = `https://api.${domain}`;
			}
		}
	} catch {}
	token ??= (await run("gh", ["auth", "token"]).catch(() => undefined))?.stdout.trim();
	if (!token) throw new Error("Not logged in to GitHub Copilot; run `/login`");
	return { token, apiBase };
}

async function fetchCopilotUsage(signal?: AbortSignal): Promise<CopilotResponse> {
	const { token, apiBase } = await copilotCredentials();
	const response = await fetch(`${apiBase}/copilot_internal/user`, {
		signal,
		headers: { Authorization: `token ${token}`, Accept: "application/json" },
	});
	if (!response.ok) throw new Error(`Copilot usage request failed: ${response.status} ${response.statusText}`);
	return (await response.json()) as CopilotResponse;
}

function formatCredits(amount: number): string {
	return `${new Intl.NumberFormat().format(Math.round(amount))} AI credits`;
}

function renderCopilot(usage: CopilotResponse, bold: Styler, dim: Styler): string[] {
	const title = usage.copilot_plan ? `GitHub Copilot AI credits (${usage.copilot_plan})` : "GitHub Copilot AI credits";
	const quota = usage.quota_snapshots?.premium_interactions;
	if (!quota) return [];
	const entitlement = quota.entitlement ?? 0;
	const used =
		quota.credits_used ??
		(quota.remaining != null && entitlement > 0 ? entitlement - quota.remaining : null);
	if (quota.unlimited || entitlement <= 0) {
		return used == null ? [] : [bold(title), `${formatCredits(used)} used ${dim("(pooled allowance)")}`];
	}
	const utilization =
		quota.percent_remaining != null
			? 100 - quota.percent_remaining
			: used != null
				? (used / entitlement) * 100
				: 0;
	const reset = usage.quota_reset_date_utc ?? usage.quota_reset_date ?? startOfNextMonth();
	const [heading, barLine, resetLine] = renderSection(title, { utilization, resets_at: reset }, bold, dim);
	const detail = used == null ? "" : `  ${dim(`(${formatCredits(used)} / ${formatCredits(entitlement)})`)}`;
	return [heading, `${barLine}${detail}`, resetLine];
}

interface DeepSeekBalance {
	currency: string;
	total_balance: string;
	granted_balance: string;
	topped_up_balance: string;
}

interface DeepSeekResponse {
	is_available?: boolean;
	balance_infos?: DeepSeekBalance[];
}

async function fetchDeepSeekBalance(token: string, signal?: AbortSignal): Promise<DeepSeekResponse> {
	const response = await fetch("https://api.deepseek.com/user/balance", {
		signal,
		headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
	});
	if (!response.ok) throw new Error(`DeepSeek balance request failed: ${response.status} ${response.statusText}`);
	return (await response.json()) as DeepSeekResponse;
}

function formatMoney(amount: string, currency: string): string {
	const value = Number(amount);
	if (!Number.isFinite(value)) return `${amount} ${currency}`;
	try {
		return new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(value);
	} catch {
		return `${amount} ${currency}`;
	}
}

function renderDeepSeek(usage: DeepSeekResponse, bold: Styler, dim: Styler): string[] {
	const lines: string[] = [];
	for (const info of usage.balance_infos ?? []) {
		const remaining = formatMoney(info.total_balance, info.currency);
		const breakdown = dim(
			`(${formatMoney(info.topped_up_balance, info.currency)} topped up, ${formatMoney(info.granted_balance, info.currency)} granted)`,
		);
		lines.push(`${remaining} remaining  ${breakdown}`);
	}
	if (!lines.length) return [];
	const unavailable = usage.is_available === false ? [dim("Balance insufficient: API calls are unavailable")] : [];
	return [bold("DeepSeek balance"), ...lines, ...unavailable];
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("usage", {
		description: "Show Claude, GitHub Copilot and DeepSeek usage",
		getArgumentCompletions: (prefix) =>
			["claude", "copilot", "deepseek"].filter((name) => name.startsWith(prefix)).map((name) => ({ value: name, label: name })),
		handler: async (args, ctx) => {
			const which = args.trim().toLowerCase();
			if (which && which !== "claude" && which !== "copilot" && which !== "deepseek") {
				ctx.ui.notify("Usage: /usage [claude|copilot|deepseek]", "error");
				return;
			}
			const explicit = which !== "";
			const hasLogin = (provider: string) => ctx.modelRegistry.getProviderAuthStatus(provider).configured;

			const sections: ((bold: Styler, dim: Styler) => string[])[] = [];
			const errors: string[] = [];
			const collect = async (name: string, fetcher: () => Promise<(bold: Styler, dim: Styler) => string[]>) => {
				try {
					sections.push(await fetcher());
				} catch (error) {
					errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
				}
			};

			const wantClaude = which === "claude" || (!explicit && hasLogin("anthropic"));
			const wantCopilot = which === "copilot" || (!explicit && hasLogin("github-copilot"));
			const wantDeepSeek = which === "deepseek" || (!explicit && hasLogin("deepseek"));
			await Promise.all([
				wantClaude &&
					collect("Claude", async () => {
						const token = await ctx.modelRegistry.getApiKeyForProvider("anthropic");
						if (!token) throw new Error("Not logged in to Anthropic; run `/login`");
						const usage = await fetchUsage(token, ctx.signal);
						return (bold, dim) => renderClaude(usage, bold, dim);
					}),
				wantCopilot &&
					collect("Copilot", async () => {
						const usage = await fetchCopilotUsage(ctx.signal);
						return (bold, dim) => renderCopilot(usage, bold, dim);
					}),
				wantDeepSeek &&
					collect("DeepSeek", async () => {
						const token = await ctx.modelRegistry.getApiKeyForProvider("deepseek");
						if (!token) throw new Error("No DeepSeek API key configured");
						const usage = await fetchDeepSeekBalance(token, ctx.signal);
						return (bold, dim) => renderDeepSeek(usage, bold, dim);
					}),
			]);
			if (!wantClaude && !wantCopilot && !wantDeepSeek) errors.push("No Anthropic, GitHub Copilot or DeepSeek credentials configured");
			if (!sections.length) {
				ctx.ui.notify(errors.join("\n"), "error");
				return;
			}
			if (errors.length) ctx.ui.notify(errors.join("\n"), "warning");

			await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
				const bold = (s: string) => theme.bold(s);
				const dim = (s: string) => theme.fg("dim", s);
				const lines: string[] = [];
				for (const section of sections) {
					const rendered = section(bold, dim);
					if (!rendered.length) continue;
					if (lines.length) lines.push("");
					lines.push(...rendered);
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
