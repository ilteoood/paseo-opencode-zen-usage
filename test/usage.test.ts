import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveCredential } from "../server/cred.ts";
import { loadSelection, saveSelection } from "../server/selection.ts";
import { fetchReport, listAccounts, listWorkspacesForUsage } from "../server/usage.ts";
import { readFreshCredential } from "../server/plumbing.ts";
import type { Credential } from "../server/types.ts";
import { usageAccountInputSchema } from "../shared/schema.ts";
interface FetchCall {
	url: string;
	headers?: Record<string, string>;
}

const realFetch = globalThis.fetch;
let calls: FetchCall[] = [];
let responses: { status: number; body: unknown }[] = [];
let installed: string | null = null;

beforeEach(() => {
	installed = mkdtempSync(join(tmpdir(), "paseo-usage-"));
	process.env.XDG_DATA_HOME = installed;
	calls = [];
	responses = [];
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const headers = init?.headers ? (init.headers as Record<string, string>) : undefined;
		calls.push({ url: String(input), headers });
		const next = responses.shift();
		if (!next) throw new Error(`unexpected fetch ${input}`);
		const text = typeof next.body === "string" ? next.body : JSON.stringify(next.body);
		return new Response(text, { status: next.status, headers: { "Content-Type": "application/json" } });
	}) as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = realFetch;
	if (installed) {
		rmSync(installed, { recursive: true, force: true });
		installed = null;
	}
	delete process.env.XDG_DATA_HOME;
});

const credential = (overrides: Partial<Credential> = {}): Credential => ({
	access: "access",
	refresh: "refresh",
	expires: Date.now() + 3_600_000,
	identity: { email: "alice@example.com", sub: "user_alice" },
	storedAt: Date.now(),
	...overrides,
});

async function saveOnly(): Promise<void> {
	await saveCredential(credential());
}

async function respondOrgs(orgsResponse: unknown): Promise<void> {
	await saveCredential(credential());
	responses.push({ status: 200, body: orgsResponse });
}

describe("usageAccountInputSchema", () => {
	test("rejects empty workspaceId", () => {
		const parsed = usageAccountInputSchema.safeParse({});
		expect(parsed.success).toBe(false);
	});

	test("rejects extra fields", () => {
		const parsed = usageAccountInputSchema.safeParse({ workspaceId: "wrk_1", extra: true });
		expect(parsed.success).toBe(false);
	});

	test("accepts a workspace id only", () => {
		const parsed = usageAccountInputSchema.safeParse({ workspaceId: "wrk_1" });
		expect(parsed.success).toBe(true);
	});
});

describe("listAccounts", () => {
	test("returns [] when no credential is stored", async () => {
		const accounts = await listAccounts({ kind: "global" });
		expect(accounts).toEqual([]);
	});

	test("returns [] when scope is session and provider is not opencode", async () => {
		await respondOrgs([{ id: "wrk_1", name: "Only" }]);
		const accounts = await listAccounts({
			kind: "session",
			provider: "anthropic",
			env: {},
		});
		expect(accounts).toEqual([]);
	});

	test("returns one account per workspace with harness + label", async () => {
		await respondOrgs([
			{ id: "wrk_alpha", name: "Alpha" },
			{ id: "wrk_beta", name: "Beta" },
		]);
		const accounts = await listAccounts({ kind: "global" });
		expect(accounts).toHaveLength(2);
		expect(accounts[0]).toMatchObject({
			harness: "opencode",
			label: "Alpha — alice@example.com",
			input: { workspaceId: "wrk_alpha" },
		});
		expect(accounts[1]?.label).toBe("Beta — alice@example.com");
		expect(new Set(accounts.map((a) => a.key)).size).toBe(2);
	});

	test("tolerates org response with `orgs` envelope", async () => {
		await respondOrgs({ orgs: [{ id: "wrk_env", name: "Enveloped" }] });
		const accounts = await listAccounts({ kind: "global" });
		expect(accounts).toHaveLength(1);
		expect(accounts[0]?.input).toEqual({ workspaceId: "wrk_env" });
	});
});

describe("fetchReport", () => {
	test("returns a window + balance per policy when the response is non-empty", async () => {
		await saveOnly();
		responses.push({
			status: 200,
			body: [
				{
					policyID: "policy_legacy_budget_88619",
					ruleID: "rule_legacy_budget_88619",
					limitDollars: 50,
					scope: "each",
					per: "set",
					spentDollars: 14.43382314,
					modelCount: 0,
				},
				{
					policyID: "policy_extra_budget_42",
					ruleID: "rule_extra_budget_42",
					limitDollars: 10,
					scope: "each",
					per: "set",
					spentDollars: 9,
					modelCount: 1,
				},
			],
		});
		const report = await fetchReport({ workspaceId: "wrk_1" });
		expect(report.status).toBe("available");
		if (report.status === "available") {
			expect(report.windows).toHaveLength(2);
			expect(report.balances).toHaveLength(2);
			const [first, second] = report.windows;
			expect(first?.id).toContain("rule_legacy_budget_88619");
			expect(first?.label).toBe("rule_legacy_budget_88619");
			expect(first?.shortLabel).toBe("mo");
			expect(first?.summary).toBe(true);
			expect(first?.usedPct).toBeCloseTo((14.43382314 / 50) * 100, 5);
			expect(second?.summary).toBeUndefined();
			const [firstBalance] = report.balances ?? [];
			expect(firstBalance).toMatchObject({
				unit: "usd",
				limit: 50,
				remaining: 50 - 14.43382314,
			});
		}
		expect(calls[0]?.headers?.["x-org-id"]).toBe("wrk_1");
		expect(calls[0]?.url).toContain("/api/policies/current-budgets");
	});

	test("returns unavailable{no_quota} when the response is empty", async () => {
		await saveOnly();
		responses.push({ status: 200, body: [] });
		const report = await fetchReport({ workspaceId: "wrk_1" });
		expect(report.status).toBe("unavailable");
		if (report.status === "unavailable" && report.problem.kind === "no_quota") {
			expect(report.problem.detail).toMatch(/current-budgets/);
		} else {
			throw new Error("expected unavailable {no_quota}");
		}
	});

	test("returns unavailable{expired} on 401", async () => {
		await saveCredential(credential({ expires: Date.now() + 10 * 60_000 }));
		responses.push({ status: 401, body: { _tag: "Unauthorized" } });
		const report = await fetchReport({ workspaceId: "wrk_1" });
		expect(report.status).toBe("unavailable");
		if (report.status === "unavailable" && report.problem.kind === "expired") {
			expect(typeof report.problem.expiresAt).toBe("string");
		} else {
			throw new Error("expected unavailable {expired}");
		}
	});

	test("returns no_quota on 403", async () => {
		await saveCredential(credential({ expires: Date.now() + 10 * 60_000 }));
		responses.push({ status: 403, body: { _tag: "Forbidden" } });
		const report = await fetchReport({ workspaceId: "wrk_1" });
		expect(report.status).toBe("unavailable");
		if (report.status === "unavailable" && report.problem.kind === "no_quota") {
			expect(typeof report.problem.detail).toBe("string");
		} else {
			throw new Error("expected unavailable {no_quota}");
		}
	});

	test("returns error when input fails schema", async () => {
		const report = await fetchReport({});
		expect(report.status).toBe("error");
	});

	test("returns error when response shape is unexpected", async () => {
		await saveOnly();
		responses.push({ status: 200, body: { _: "not an array" } });
		const report = await fetchReport({ workspaceId: "wrk_1" });
		expect(report.status).toBe("error");
	});
});

describe("workspace watchlist", () => {
	test("listAccounts seeds selection.json with every org on first run", async () => {
		await respondOrgs([
			{ id: "wrk_alpha", name: "Alpha" },
			{ id: "wrk_beta", name: "Beta" },
		]);
		const accounts = await listAccounts({ kind: "global" });
		expect(accounts).toHaveLength(2);
		const selection = await loadSelection();
		expect(selection?.workspaceIds).toEqual(["wrk_alpha", "wrk_beta"]);
	});

	test("listAccounts filters to the intersection of selection and /api/orgs", async () => {
		await respondOrgs([
			{ id: "wrk_alpha", name: "Alpha" },
			{ id: "wrk_beta", name: "Beta" },
		]);
		await saveSelection(["wrk_alpha", "wrk_ghost"]);
		const accounts = await listAccounts({ kind: "global" });
		expect(accounts).toHaveLength(1);
		expect(accounts[0]?.input).toEqual({ workspaceId: "wrk_alpha" });
	});

	test("listAccounts returns [] when selection has no overlap with /api/orgs", async () => {
		await respondOrgs([{ id: "wrk_alpha", name: "Alpha" }]);
		await saveSelection(["wrk_other"]);
		const accounts = await listAccounts({ kind: "global" });
		expect(accounts).toEqual([]);
	});

	test("listAccounts returns [] without seeding when /api/orgs is empty", async () => {
		await saveCredential(credential());
		responses.push({ status: 200, body: [] });
		const accounts = await listAccounts({ kind: "global" });
		expect(accounts).toEqual([]);
		expect(await loadSelection()).toBeNull();
	});

	test("listWorkspacesForUsage tags each entry with its selected state", async () => {
		await respondOrgs([
			{ id: "wrk_alpha", name: "Alpha" },
			{ id: "wrk_beta", name: "Beta" },
		]);
		await saveSelection(["wrk_alpha"]);
		const credentialSnap = credential();
		const result = await listWorkspacesForUsage(credentialSnap.access);
		expect(result.totalCount).toBe(2);
		expect(result.entries).toEqual([
			{ id: "wrk_alpha", name: "Alpha", selected: true, present: true },
			{ id: "wrk_beta", name: "Beta", selected: false, present: true },
		]);
	});

	test("listWorkspacesForUsage returns ghost entries for picks no longer in /api/orgs", async () => {
		await respondOrgs([{ id: "wrk_alpha", name: "Alpha" }]);
		await saveSelection(["wrk_alpha", "wrk_ghost"]);
		const credentialSnap = credential();
		const result = await listWorkspacesForUsage(credentialSnap.access);
		expect(result.totalCount).toBe(1);
		expect(result.entries).toEqual([
			{ id: "wrk_alpha", name: "Alpha", selected: true, present: true },
			{ id: "wrk_ghost", name: "wrk_ghost", selected: true, present: false },
		]);
	});

	test("listWorkspacesForUsage works after refreshing a near-expiry credential", async () => {
		await saveCredential(credential({ expires: Date.now() + 30_000, refresh: "rotating" }));
		responses.push({
			status: 200,
			body: { access_token: "rotated-acc", refresh_token: "rotated-ref", expires_in: 3600 },
		});
		responses.push({
			status: 200,
			body: [
				{ id: "wrk_alpha", name: "Alpha" },
				{ id: "wrk_beta", name: "Beta" },
			],
		});
		const fresh = await readFreshCredential();
		expect(fresh).not.toBeNull();
		const result = await listWorkspacesForUsage(fresh!.access);
		expect(result.totalCount).toBe(2);
		expect(result.entries.map((entry) => entry.id)).toEqual(["wrk_alpha", "wrk_beta"]);
		const orgsCall = calls.find((call) => call.url.includes("/api/orgs"));
		expect((orgsCall?.headers as Record<string, string> | undefined)?.Authorization).toBe(
			"Bearer rotated-acc",
		);
	});
});
