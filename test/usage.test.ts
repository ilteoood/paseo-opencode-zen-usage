import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveCredential } from "../server/cred.ts";
import { fetchReport, listAccounts } from "../server/usage.ts";
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
	test("returns window + balance when the API row matches identity email", async () => {
		await saveOnly();
		responses.push({
			status: 200,
			body: [
				{
					user_id: "user_other",
					email: "bob@example.com",
					limit_micro_cents: "100000000",
					spent_micro_cents: "25000000",
					exceeded: false,
					resets_at: "2026-10-01T00:00:00.000Z",
					source: "default",
					updated_at: null,
				},
				{
					user_id: "user_alice",
					email: "alice@example.com",
					limit_micro_cents: "200000000",
					spent_micro_cents: "50000000",
					exceeded: false,
					resets_at: "2026-10-01T00:00:00.000Z",
					source: "custom",
					updated_at: "2026-09-03T12:00:00.000Z",
				},
			],
		});
		const report = await fetchReport({ workspaceId: "wrk_1" });
		expect(report.status).toBe("available");
		if (report.status === "available") {
			expect(report.planLabel).toBe("Custom override");
			expect(report.windows).toHaveLength(1);
			const window = report.windows[0]!;
			expect(window.id).toBe("monthly");
			expect(window.label).toBe("Monthly budget");
			expect(window.usedPct).toBeCloseTo(25, 5);
			expect(window.resetsAt).toBe("2026-10-01T00:00:00.000Z");
			expect(report.balances?.[0]).toMatchObject({
				unit: "usd",
				limit: 2,
				remaining: 1.5,
			});
		}
		expect(calls[0]?.headers?.["x-org-id"]).toBe("wrk_1");
		expect(calls[0]?.url).toContain("/api/v1/budgets/members");
	});

	test("returns unavailable{no_quota} when no row matches identity", async () => {
		await saveOnly();
		responses.push({
			status: 200,
			body: [
				{
					user_id: "user_other",
					email: "bob@example.com",
					limit_micro_cents: "100000000",
					spent_micro_cents: "10000000",
					exceeded: false,
					resets_at: "2026-10-01T00:00:00.000Z",
					source: "default",
					updated_at: null,
				},
			],
		});
		const report = await fetchReport({ workspaceId: "wrk_1" });
		expect(report.status).toBe("unavailable");
		if (report.status === "unavailable" && report.problem.kind === "no_quota") {
			expect(report.problem.detail).toMatch(/no row matches/);
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

	test("returns unavailable{rejected} on 403", async () => {
		await saveCredential(credential({ expires: Date.now() + 10 * 60_000 }));
		responses.push({ status: 403, body: { _tag: "Forbidden" } });
		const report = await fetchReport({ workspaceId: "wrk_1" });
		expect(report.status).toBe("unavailable");
		if (report.status === "unavailable" && report.problem.kind === "rejected") {
			expect(report.problem.status).toBe(403);
		} else {
			throw new Error("expected unavailable {rejected}");
		}
	});

	test("returns error when input fails schema", async () => {
		const report = await fetchReport({});
		expect(report.status).toBe("error");
	});
});
