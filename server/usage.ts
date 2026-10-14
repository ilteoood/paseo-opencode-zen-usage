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
import type { BudgetMember, Org } from "./types.ts";
import { usageAccountInputSchema } from "../shared/schema.ts";

const USAGE_INPUT = usageAccountInputSchema;
const ONE_MICROCENT_TO_USD = 100_000_000;
const HARNESS = "opencode";

function sessionMatches(scope: UsageScope): boolean {
	if (scope.kind !== "session") return true;
	const provider = scope.provider.toLowerCase();
	return provider === "opencode" || provider === "opencode-zen" || provider.startsWith("opencode-zen-");
}

async function loadCredential(): Promise<Awaited<ReturnType<typeof readFreshCredential>>> {
	return readFreshCredential();
}

function toNumberOrNull(value: string | null | undefined): number | null {
	if (typeof value !== "string") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function accountKeyFor(workspaceId: string, identitySubject: string | null): string {
	const subject = identitySubject ?? "anonymous";
	return hashAccountKey(`${workspaceId}:${HARNESS}:${subject}`);
}

function memberMatchesIdentity(member: BudgetMember, identity: { email: string | null; sub: string | null }): boolean {
	if (identity.email && member.email === identity.email) return true;
	if (identity.sub && member.user_id === identity.sub) return true;
	return false;
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

function reportFromMember(member: BudgetMember, planLabel: string): UsageReport {
	const limit = toNumberOrNull(member.limit_micro_cents);
	const spent = toNumberOrNull(member.spent_micro_cents);
	const resetsAt = member.resets_at;
	const usedPct = limit !== null && spent !== null && limit > 0 ? (spent / limit) * 100 : null;
	const tone = toneFromUsedPct(usedPct);
	const window: UsageWindow = windowFromUsedPct({
		id: "monthly",
		label: "Monthly budget",
		shortLabel: "mo",
		summary: true,
		utilizationPct: usedPct,
		resetsAt,
		tone,
	});
	const balance: UsageBalance = {
		id: "monthly-balance",
		label: "This month",
		used: spent !== null ? spent / ONE_MICROCENT_TO_USD : null,
		limit: limit !== null ? limit / ONE_MICROCENT_TO_USD : null,
		remaining: limit !== null && spent !== null ? (limit - spent) / ONE_MICROCENT_TO_USD : null,
		unit: "usd",
		resetsAt,
		tone,
	};
	const details = [];
	if (member.exceeded) {
		details.push({
			id: "exceeded",
			label: "Status",
			value: "Over budget for the cycle",
			tone: "danger" as const,
		});
	}
	return {
		status: "available",
		planLabel,
		windows: [window],
		balances: [balance],
		details: details.length > 0 ? details : undefined,
	};
}

function workspaceTotalReport(members: BudgetMember[], planLabel: string): UsageReport {
	const totals = members.reduce(
		(acc, member) => {
			if (member.limit_micro_cents !== null) {
				acc.limit += toNumberOrNull(member.limit_micro_cents) ?? 0;
				acc.limitedCount += 1;
			}
			if (member.spent_micro_cents !== null) {
				acc.spent += toNumberOrNull(member.spent_micro_cents) ?? 0;
			}
			return acc;
		},
		{ limit: 0, spent: 0, limitedCount: 0 },
	);
	const usedPct = totals.limit > 0 ? (totals.spent / totals.limit) * 100 : null;
	const resetsAt = members[0]?.resets_at ?? null;
	const exceedsBudget = members.some((member) => member.exceeded);
	const tone = toneFromUsedPct(usedPct);
	return {
		status: "available",
		planLabel,
		windows: [
			windowFromUsedPct({
				id: "workspace-monthly",
				label: "Workspace total",
				shortLabel: "ws",
				utilizationPct: usedPct,
				resetsAt,
				tone,
			}),
		],
		balances: [
			{
				id: "workspace-monthly-balance",
				label: "Workspace total",
				used: totals.limitedCount > 0 ? totals.spent / ONE_MICROCENT_TO_USD : null,
				limit: totals.limitedCount > 0 ? totals.limit / ONE_MICROCENT_TO_USD : null,
				remaining: totals.limitedCount > 0 ? (totals.limit - totals.spent) / ONE_MICROCENT_TO_USD : null,
				unit: "usd",
				resetsAt,
				tone,
			},
		],
		details: exceedsBudget
			? [{ id: "exceeded", label: "Status", value: "Workspace member over budget", tone: "danger" as const }]
			: undefined,
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
				kind: "rejected",
				status: 403,
				refreshedBy: HARNESS,
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
			kind: "rejected",
			status: 401,
			refreshedBy: HARNESS,
		});
	}
	let members: BudgetMember[];
	try {
		members = await fetchWithWorkspace<BudgetMember[]>(`${CONSOLE}/api/v1/budgets/members`, credential.access, workspaceId);
	} catch (error) {
		return diagnoseError(error);
	}
	if (!Array.isArray(members)) {
		return { status: "error", error: "unexpected budget response shape" };
	}
	const personal = members.find((member) => memberMatchesIdentity(member, credential.identity));
	if (personal) {
		const planLabel = personal.source === "custom" ? "Custom override" : "Workspace default";
		return reportFromMember(personal, planLabel);
	}
	if (credential.identity.email === null && credential.identity.sub === null) {
		return workspaceTotalReport(members, "Workspace total");
	}
	return unavailable({
		kind: "no_quota",
		detail: "no row matches your identity in this workspace",
	});
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

export const __testing = { hash: createHash, ONE_MICROCENT_TO_USD, accountKeyFor };
