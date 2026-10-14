import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONSOLE } from "../server/plumbing.ts";
import { disconnect, pollDeviceSession, startDeviceSession } from "../server/auth.ts";
import { loadCredential } from "../server/cred.ts";
import { loadSelection, saveSelection } from "../server/selection.ts";

interface FetchCall {
	url: string;
	body?: URLSearchParams;
}

const realFetch = globalThis.fetch;
let calls: FetchCall[] = [];
let responses: { status: number; body: unknown }[] = [];
let installed: string | null = null;
let now = Date.now();

beforeEach(() => {
	installed = mkdtempSync(join(tmpdir(), "paseo-auth-"));
	process.env.XDG_DATA_HOME = installed;
	calls = [];
	responses = [];
	now = Date.now();
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const body = init?.body && typeof init.body === "string" ? new URLSearchParams(init.body) : undefined;
		calls.push({ url, body });
		const next = responses.shift();
		if (!next) throw new Error(`unexpected fetch ${url}`);
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

const VERIFICATION_PATH = "/console/device?user_code=ABCD-EFGH";
const START_BODY = {
	device_code: "dc",
	user_code: "ABCD-EFGH",
	verification_uri_complete: VERIFICATION_PATH,
	expires_in: 600,
	interval: 0.001,
};

function accessTokenJws(email: string): string {
	const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
	const payload = Buffer.from(JSON.stringify({ email, sub: `user_${email.split("@")[0]}` })).toString("base64url");
	return `${header}.${payload}.fake-signature`;
}

describe("startDeviceSession", () => {
	test("emits pending state with the verification URL at console origin", async () => {
		responses.push({ status: 200, body: START_BODY });
		const state = await startDeviceSession(now);
		expect(state.status).toBe("pending");
		expect(state.verificationUri).toBe(`https://opencode.ai${VERIFICATION_PATH}`);
		expect(state.userCode).toBe("ABCD-EFGH");
		expect(state.pollIntervalSeconds).toBe(1);
		expect(state.expiresAt).toBe(now + 600_000);
		const call = calls[0];
		expect(call?.url).toBe(`${CONSOLE}/auth/device/code`);
		expect(call?.body?.get("client_id")).toBe("paseo-opencode-zen-usage");
	});
});

describe("pollDeviceSession", () => {
	function queuePending() {
		responses.push({ status: 400, body: { error: "authorization_pending" } });
	}

	test("returns pending without expiry when polling repeats", async () => {
		responses.push({ status: 200, body: START_BODY });
		await startDeviceSession(now);
		queuePending();
		const state = await pollDeviceSession(now + 2_000);
		expect(state.status).toBe("pending");
	});

	test("transitions to connected on token receipt and persists cred with decoded email", async () => {
		responses.push({ status: 200, body: START_BODY });
		await startDeviceSession(now);
		responses.push({
			status: 200,
			body: {
				access_token: accessTokenJws("alice@example.com"),
				refresh_token: "rotating",
				expires_in: 3600,
			},
		});
		const state = await pollDeviceSession(now + 5_000);
		expect(state.status).toBe("connected");
		expect(state.identityEmail).toBe("alice@example.com");
		const stored = await loadCredential();
		expect(stored?.identity.email).toBe("alice@example.com");
		expect(stored?.refresh).toBe("rotating");
	});

	test("transitions to denied on access_denied", async () => {
		responses.push({ status: 200, body: START_BODY });
		await startDeviceSession(now);
		responses.push({ status: 400, body: { error: "access_denied", error_description: "no thanks" } });
		const state = await pollDeviceSession(now + 5_000);
		expect(state.status).toBe("denied");
		expect(state.error).toBe("no thanks");
	});

	test("marks expired when deadline passes", async () => {
		responses.push({ status: 200, body: START_BODY });
		await startDeviceSession(now);
		const state = await pollDeviceSession(now + 601_000);
		expect(state.status).toBe("expired");
	});

	test("slow_down grows the polling interval", async () => {
		responses.push({ status: 200, body: START_BODY });
		await startDeviceSession(now);
		responses.push({ status: 400, body: { error: "slow_down" } });
		queuePending();
		const state = await pollDeviceSession(now + 5_000);
		expect(state.status).toBe("pending");
		expect(state.pollIntervalSeconds).toBeGreaterThanOrEqual(5);
	});
});

describe("disconnect", () => {
	test("clears the on-disk credential", async () => {
		responses.push({ status: 200, body: START_BODY });
		await startDeviceSession(now);
		responses.push({
			status: 200,
			body: { access_token: accessTokenJws("bob@example.com"), refresh_token: "r", expires_in: 3600 },
		});
		await pollDeviceSession(now + 1_000);
		expect(await loadCredential()).not.toBeNull();
		const result = await disconnect();
		expect(result.ok).toBe(true);
		expect(await loadCredential()).toBeNull();
	});
test("preserves any selection.json across disconnect", async () => {
		responses.push({ status: 200, body: START_BODY });
		await startDeviceSession(now);
		responses.push({
			status: 200,
			body: { access_token: accessTokenJws("carol@example.com"), refresh_token: "r", expires_in: 3600 },
		});
		await pollDeviceSession(now + 1_000);
		await saveSelection(["wrk_a", "wrk_b"]);
		expect(await loadSelection()).toEqual({ workspaceIds: ["wrk_a", "wrk_b"] });
		const result = await disconnect();
		expect(result.ok).toBe(true);
		expect(await loadCredential()).toBeNull();
		expect(await loadSelection()).toEqual({ workspaceIds: ["wrk_a", "wrk_b"] });
	});
});
