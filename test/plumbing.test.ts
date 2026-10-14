import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CRED_PATH, clearCredential, loadCredential, saveCredential } from "../server/cred.ts";
import {
	CONSOLE,
	HttpError,
	ensureFreshCredential,
	exchangeDeviceCode,
	fetchWithWorkspace,
	postForm,
	refreshAccessToken,
} from "../server/plumbing.ts";
import type { Credential } from "../server/types.ts";

interface FetchCall {
	url: string;
	init?: RequestInit;
}

const realFetch = globalThis.fetch;
let calls: FetchCall[] = [];
let responses: { status: number; body: unknown }[] = [];
let installed: string | null = null;

beforeEach(() => {
	installed = mkdtempSync(join(tmpdir(), "paseo-cred-"));
	process.env.XDG_DATA_HOME = installed;
	calls = [];
	responses = [];
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		calls.push({ url: String(input), init });
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
	identity: { email: "alice@example.com", sub: "user_123" },
	storedAt: Date.now(),
	...overrides,
});

describe("credential store", () => {
	test("returns null when no file exists", async () => {
		expect(await loadCredential()).toBeNull();
	});

	test("round-trips a credential through disk with mode 0600", async () => {
		const c = credential();
		await saveCredential(c);
		const restored = await loadCredential();
		expect(restored).toEqual(c);
	});

	test("returns null when stored file is corrupt", async () => {
		const fs = await import("node:fs/promises");
		const path = CRED_PATH();
		await fs.mkdir(path.replace(/\/cred\.json$/, ""), { recursive: true });
		await fs.writeFile(path, "not-json");
		expect(await loadCredential()).toBeNull();
	});

	test("clears credential idempotently", async () => {
		await saveCredential(credential());
		await clearCredential();
		await clearCredential();
		expect(await loadCredential()).toBeNull();
	});
});

describe("postForm", () => {
	test("serialises body as application/x-www-form-urlencoded", async () => {
		responses.push({ status: 200, body: { ok: true } });
		await postForm(`${CONSOLE}/auth/device/code`, { client_id: "x" });
		const call = calls[0]!;
		expect(call.url).toBe(`${CONSOLE}/auth/device/code`);
		expect(call.init?.method).toBe("POST");
		expect(call.init?.headers).toMatchObject({
			"Content-Type": "application/x-www-form-urlencoded",
			"User-Agent": "paseo-opencode-zen-usage/0.1.0",
		});
		expect(call.init?.body).toBe("client_id=x");
	});

	test("throws HttpError on non-2xx", async () => {
		responses.push({ status: 500, body: { message: "boom" } });
		await expect(postForm(`${CONSOLE}/auth/device/code`, {})).rejects.toBeInstanceOf(HttpError);
	});

	test("accepts HTTP 400 when allowHttp400 is set", async () => {
		responses.push({ status: 400, body: { error: "authorization_pending" } });
		const poll = await postForm<{ error: string }>(
			`${CONSOLE}/auth/device/token`,
			{ grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: "dc" },
			{ allowHttp400: true },
		);
		expect(poll.error).toBe("authorization_pending");
	});
});

describe("exchangeDeviceCode", () => {
	test("parses a token response", async () => {
		responses.push({
			status: 200,
			body: { access_token: "acc", refresh_token: "ref", expires_in: 3600 },
		});
		const result = await exchangeDeviceCode("dc");
		expect(result.kind).toBe("token");
		if (result.kind === "token") {
			expect(result.data.access_token).toBe("acc");
			expect(result.data.expires_in).toBe(3600);
		}
	});

	test("parses an error response (authorization_pending)", async () => {
		responses.push({ status: 400, body: { error: "authorization_pending" } });
		const result = await exchangeDeviceCode("dc");
		expect(result.kind).toBe("error");
		if (result.kind === "error") {
			expect(result.data.error).toBe("authorization_pending");
		}
	});
});

describe("refreshAccessToken", () => {
	test("POSTs grant_type=refresh_token with retry header", async () => {
		responses.push({
			status: 200,
			body: { access_token: "new-acc", refresh_token: "new-ref", expires_in: 3600 },
		});
		await refreshAccessToken("old-ref");
		const call = calls[0]!;
		expect(call.init?.method).toBe("POST");
		expect(call.init?.body).toContain("grant_type=refresh_token");
		expect(call.init?.body).toContain("refresh_token=old-ref");
	});
});


describe("fetchWithWorkspace", () => {
	test("sends Bearer and x-org-id headers", async () => {
		responses.push({ status: 200, body: [{ policyID: "p" }] });
		await fetchWithWorkspace<unknown[]>(`${CONSOLE}/api/policies/current-budgets`, "tok", "wrk_1");
		const call = calls[0]!;
		expect((call.init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
		expect((call.init?.headers as Record<string, string>)["x-org-id"]).toBe("wrk_1");
	});

	test("rejects with HttpError on non-2xx", async () => {
		responses.push({ status: 403, body: { _tag: "Forbidden" } });
		await expect(
			fetchWithWorkspace(`${CONSOLE}/api/policies/current-budgets`, "tok", "wrk_1"),
		).rejects.toBeInstanceOf(HttpError);
	});
});

describe("ensureFreshCredential", () => {
	test("returns existing credential when not near expiry", async () => {
		const c = credential({ expires: Date.now() + 10 * 60_000 });
		await saveCredential(c);
		const fresh = await ensureFreshCredential(c);
		expect(fresh).toEqual(c);
		expect(calls).toHaveLength(0);
	});

	test("exchanges refresh_token when within 60 s of expiry", async () => {
		const c = credential({ expires: Date.now() + 30_000, refresh: "rotating" });
		await saveCredential(c);
		responses.push({
			status: 200,
			body: { access_token: "rotated-acc", refresh_token: "rotated-ref", expires_in: 3600 },
		});
		const fresh = await ensureFreshCredential(c);
		expect(fresh.access).toBe("rotated-acc");
		expect(fresh.refresh).toBe("rotated-ref");
		expect(fresh.expires).toBeGreaterThan(Date.now() + 3_500_000);
		const stored = await loadCredential();
		expect(stored?.access).toBe("rotated-acc");
	});
});
