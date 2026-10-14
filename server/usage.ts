import { createHash } from "node:crypto";
import { z } from "zod";
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

import { CONSOLE, HttpError, fetchJson, fetchWithWorkspace, readFreshCredential } from "./plumbing.ts";
import type { CurrentBudget, Org } from "./types.ts";
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

async function fetchOrganizations(token: string): Promise<Org[]> {
	const list = await fetchJson<Org[] | { orgs?: Org[] }>(`${CONSOLE}/api/orgs`, token);
	const records = Array.isArray(list) ? list : (list.orgs ?? []);
	return records
		.filter((org): org is Org => Boolean(org) && typeof org === "object")
		.map((org) => ({
			id: typeof org.id === "string" ? org.id : "",
			name: typeof org.name === "string" && org.name.length > 0 ? org.name : (typeof org.id === "string" ? org.id : "Workspace"),
		}))
		.filter((org) => org.id.length > 0);
}

export async function listAccounts(scope: UsageScope): Promise<UsageAccount[]> {
	if (!sessionMatches(scope)) return [];
	const credential = await loadCredential();
	if (!credential) return [];
	const orgs = await fetchOrganizations(credential.access);
	const subject = credential.identity.email ?? credential.identity.sub;
	return orgs.map((org) => {
		const key = accountKeyFor(org.id, subject);
		const email = credential.identity.email;
		const label = email ? `${org.name} — ${email}` : org.name;
		return {
			key,
			label,
			harness: HARNESS,
			input: { workspaceId: org.id },
		};
	});
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
	input: z.object({ workspaceId: z.string().min(1) }).strict(),
	discover: listAccounts,
	fetch: fetchReport,
};

export function deriveAccountKey(workspaceId: string, identitySubject: string | null): string {
	return accountKeyFor(workspaceId, identitySubject);
}

export const __testing = { hash: createHash, accountKeyFor };
