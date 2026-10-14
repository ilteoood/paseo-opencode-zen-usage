import {
	hashAccountKey,
	toneFromUsedPct,
	unavailable,
	windowFromUsedPct,
} from "@getpaseo/plugin/server/usage";
import type {
	UsageAccount,
	UsageBalance,
	UsageReport,
	UsageScope,
	UsageSourceRegistration,
	UsageWindow,
} from "@getpaseo/plugin/server/usage";

import { CONSOLE, HttpError, fetchWithWorkspace, readFreshCredential } from "./plumbing.ts";
import { listOrgs } from "./orgs.ts";
import { ensureSeeded, loadSelection } from "./selection.ts";
import type { Org, CurrentBudget } from "./types.ts";
import { usageAccountInputSchema } from "../shared/schema.ts";

const USAGE_INPUT = usageAccountInputSchema;
const HARNESS = "opencode";

function sessionMatches(scope: UsageScope): boolean {
	if (scope.kind !== "session") return true;
	const provider = scope.provider.toLowerCase();
	return provider === "opencode" || provider === "opencode-zen" || provider.startsWith("opencode-zen-");
}

async function loadCredential(): Promise<Awaited<ReturnType<typeof readFreshCredential>>> {
	return readFreshCredential();
}

function accountKeyFor(workspaceId: string, identitySubject: string | null): string {
	const subject = identitySubject ?? "anonymous";
	return hashAccountKey(`${workspaceId}:${HARNESS}:${subject}`);
}

async function watchedOrgs(token: string): Promise<{ orgs: Org[]; selectedIds: Set<string> }> {
	const orgs = await listOrgs(token);
	if (orgs.length === 0) return { orgs: [], selectedIds: new Set() };
	const selection = await ensureSeeded(orgs.map((org) => org.id));
	return { orgs, selectedIds: new Set(selection.workspaceIds) };
}

export async function listWorkspacesForUsage(
	token: string,
): Promise<{ entries: Array<{ id: string; name: string; selected: boolean; present: boolean }>; totalCount: number }> {
	const { orgs, selectedIds } = await watchedOrgs(token);
	const orgIds = new Set(orgs.map((org) => org.id));
	const present = orgs.map((org) => ({
		id: org.id,
		name: org.name,
		selected: selectedIds.has(org.id),
		present: true,
	}));
	const ghosts = [...selectedIds]
		.filter((id) => !orgIds.has(id))
		.map((id) => ({ id, name: id, selected: true, present: false }));
	return { entries: [...present, ...ghosts], totalCount: present.length };
}

export async function listAccounts(scope: UsageScope): Promise<UsageAccount[]> {
	if (!sessionMatches(scope)) return [];
	const credential = await loadCredential();
	if (!credential) return [];
	const { orgs, selectedIds } = await watchedOrgs(credential.access);
	const subject = credential.identity.email ?? credential.identity.sub;
	const email = credential.identity.email;
	return orgs
		.filter((org) => selectedIds.has(org.id))
		.map((org) => ({
			key: accountKeyFor(org.id, subject),
			label: email ? `${org.name} — ${email}` : org.name,
			harness: HARNESS,
			input: { workspaceId: org.id },
		}));
}

function windowAndBalanceForBudget(index: number, budget: CurrentBudget): { window: UsageWindow; balance: UsageBalance } {
	const usedPct =
		budget.limitDollars !== null && budget.spentDollars !== null && budget.limitDollars > 0
			? (budget.spentDollars / budget.limitDollars) * 100
			: null;
	const tone = toneFromUsedPct(usedPct);
	const id = `policy-${budget.ruleID}-${index}`;
	const label = budget.ruleID;
	const remaining =
		budget.limitDollars !== null && budget.spentDollars !== null
			? budget.limitDollars - budget.spentDollars
			: null;
	const window: UsageWindow = windowFromUsedPct({
		id,
		label,
		shortLabel: "mo",
		summary: index === 0,
		utilizationPct: usedPct,
		tone,
	});
	const balance: UsageBalance = {
		id: `${id}-balance`,
		label,
		used: budget.spentDollars,
		limit: budget.limitDollars,
		remaining,
		unit: "usd",
		tone,
	};
	return { window, balance };
}

function reportFromBudgets(budgets: CurrentBudget[]): UsageReport {
	const pairs = budgets.map((budget, index) => windowAndBalanceForBudget(index, budget));
	return {
		status: "available",
		windows: pairs.map((pair) => pair.window),
		balances: pairs.map((pair) => pair.balance),
	};
}

function diagnoseError(error: unknown): UsageReport {
	if (error instanceof HttpError) {
		if (error.status === 401) {
			return unavailable({
				kind: "expired",
				expiresAt: new Date().toISOString(),
			});
		}
		if (error.status === 403) {
			return unavailable({
				kind: "no_quota",
				detail: `OpenCode returned 403 for this workspace; the token does not list it. Reconnect from Command Center or pick another workspace.`,
			});
		}
	}
	return { status: "error", error: error instanceof Error ? error.message : String(error) };
}

export async function fetchReport(input: unknown): Promise<UsageReport> {
	const parsed = USAGE_INPUT.safeParse(input);
	if (!parsed.success) {
		return { status: "error", error: parsed.error.message };
	}
	const { workspaceId } = parsed.data;
	const credential = await loadCredential();
	if (!credential) {
		return unavailable({
			kind: "expired",
			expiresAt: new Date().toISOString(),
		});
	}
	const selection = await loadSelection();
	if (!selection || !selection.workspaceIds.includes(workspaceId)) {
		return unavailable({
			kind: "no_quota",
			detail: "workspace is not on the watchlist",
		});
	}
	let budgets: CurrentBudget[];
	try {
		budgets = await fetchWithWorkspace<CurrentBudget[]>(
			`${CONSOLE}/api/policies/current-budgets`,
			credential.access,
			workspaceId,
		);
	} catch (error) {
		return diagnoseError(error);
	}
	if (!Array.isArray(budgets)) {
		return { status: "error", error: "unexpected budget response shape" };
	}
	if (budgets.length === 0) {
		return unavailable({
			kind: "no_quota",
			detail: "no current-budgets row for this workspace",
		});
	}
	return reportFromBudgets(budgets);
}

export const opencodeZenUsageSource: UsageSourceRegistration = {
	id: "opencode-zen-usage",
	label: "OpenCode Zen",
	input: usageAccountInputSchema,
	discover: listAccounts,
	fetch: fetchReport,
};
