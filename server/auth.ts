import { CONSOLE, exchangeDeviceCode, startDeviceCode } from "./plumbing.ts";
import { clearCredential, saveCredential } from "./cred.ts";
import type { ConnectState, ConnectStatus } from "../shared/schema.ts";
import type { Identity } from "./types.ts";

interface PendingSession {
	deviceCode: string;
	userCode: string;
	verificationUri: string;
	expiresAt: number;
	intervalMs: number;
}

const SLOW_DOWN_PENALTY_MS = 5_000;

let current: PendingSession | null = null;

function decodeIdentity(accessToken: string): Identity {
	const parts = accessToken.split(".");
	if (parts.length !== 3) return { email: null, sub: null };
	try {
		const payloadRaw = Buffer.from(parts[1] ?? "", "base64url").toString("utf8");
		const payload = JSON.parse(payloadRaw) as Record<string, unknown>;
		const email = typeof payload.email === "string" ? payload.email : null;
		const sub = typeof payload.sub === "string" ? payload.sub : null;
		if (!email && !sub) return { email: null, sub: null };
		const accountEmail = (() => {
			const account = payload.account;
			if (account && typeof account === "object") {
				const value = (account as { email?: unknown }).email;
				if (typeof value === "string") return value;
			}
			return null;
		})();
		return { email: email ?? accountEmail, sub };
	} catch {
		return { email: null, sub: null };
	}
}

function snapshot(status: ConnectStatus, overrides: Partial<ConnectState> = {}): ConnectState {
	return {
		status,
		userCode: null,
		verificationUri: null,
		expiresAt: null,
		pollIntervalSeconds: null,
		identityEmail: null,
		workspaceCount: null,
		error: null,
		...overrides,
	};
}

export async function startDeviceSession(now = Date.now()): Promise<ConnectState> {
	const start = await startDeviceCode();
	const verificationUri = new URL(start.verification_uri_complete, `${CONSOLE}/`).toString();
	const expiresAt = now + start.expires_in * 1_000;
	const intervalSeconds = Math.max(1, Math.ceil(start.interval));
	const intervalMs = intervalSeconds * 1_000;
	current = {
		deviceCode: start.device_code,
		userCode: start.user_code,
		verificationUri,
		expiresAt,
		intervalMs,
	};
	return snapshot("pending", {
		userCode: start.user_code,
		verificationUri,
		expiresAt,
		pollIntervalSeconds: intervalSeconds,
	});
}

export async function pollDeviceSession(now = Date.now()): Promise<ConnectState> {
	const session = current;
	if (!session) return snapshot("idle");
	if (now >= session.expiresAt) {
		current = null;
		return snapshot("expired");
	}
	const response = await exchangeDeviceCode(session.deviceCode);
	if (current !== session) return snapshot("idle");
	if (response.kind === "token") {
		const identity = decodeIdentity(response.data.access_token);
		const credential = {
			access: response.data.access_token,
			refresh: response.data.refresh_token,
			expires: now + response.data.expires_in * 1_000,
			identity,
			storedAt: now,
		};
		await saveCredential(credential);
		current = null;
		return snapshot("connected", { identityEmail: identity.email });
	}
	const error = response.data.error;
	if (error === "authorization_pending") {
		return snapshot("pending", pendingSnapshot(session));
	}
	if (error === "slow_down") {
		session.intervalMs = Math.min(session.intervalMs + SLOW_DOWN_PENALTY_MS, 30_000);
		return snapshot("pending", pendingSnapshot(session));
	}
	if (error === "access_denied") {
		current = null;
		return snapshot("denied", { error: response.data.error_description ?? "access_denied" });
	}
	current = null;
	return snapshot("expired", { error: `${error}: ${response.data.error_description ?? ""}`.trim() });
}

function pendingSnapshot(session: PendingSession): Pick<ConnectState, "userCode" | "verificationUri" | "expiresAt" | "pollIntervalSeconds"> {
	const pollIntervalSeconds = Math.max(1, Math.ceil(session.intervalMs / 1_000));
	return {
		userCode: session.userCode,
		verificationUri: session.verificationUri,
		expiresAt: session.expiresAt,
		pollIntervalSeconds,
	};
}
export async function disconnect(): Promise<{ ok: boolean }> {
	current = null;
	await clearCredential();
	return { ok: true };
}

