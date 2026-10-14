import { loadCredential, saveCredential } from "./cred.ts";
import type { Credential, DeviceStart, DeviceResponse, DeviceToken, DeviceError } from "./types.ts";

export const CONSOLE = "https://opencode.ai/console";
export const CLIENT_ID = "paseo-opencode-zen-usage";
export const USER_AGENT = "paseo-opencode-zen-usage/0.1.0";

export class HttpError extends Error {
	status: number;
	body: string;
	constructor(status: number, body: string, message: string) {
		super(message);
		this.status = status;
		this.body = body;
	}
}

export class ProtocolError extends Error {
	raw: string;
	constructor(raw: string) {
		super(`non-JSON response: ${raw.slice(0, 120)}`);
		this.raw = raw;
	}
}

async function readText(response: Response): Promise<string> {
	try {
		return await response.text();
	} catch {
		return "";
	}
}

function tryParse<T>(text: string): T {
	if (text.length === 0) return {} as T;
	try {
		return JSON.parse(text) as T;
	} catch {
		throw new ProtocolError(text);
	}
}

function bearerHeaders(token: string): Record<string, string> {
	return {
		Authorization: `Bearer ${token}`,
		Accept: "application/json",
		"User-Agent": USER_AGENT,
	};
}

export async function postForm<T>(
	url: string,
	body: Record<string, string>,
	options: { allowHttp400?: boolean } = {},
): Promise<T> {
	const params = new URLSearchParams(body);
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Accept: "application/json",
			"User-Agent": USER_AGENT,
		},
		body: params.toString(),
	});
	const text = await readText(response);
	if (!response.ok && !(options.allowHttp400 && response.status === 400)) {
		throw new HttpError(response.status, text, `${url}: HTTP ${response.status}: ${text.slice(0, 200)}`);
	}
	return tryParse<T>(text);
}

export async function startDeviceCode(): Promise<DeviceStart> {
	return postForm<DeviceStart>(`${CONSOLE}/auth/device/code`, { client_id: CLIENT_ID });
}

function asDeviceResponse(body: unknown): DeviceResponse {
	if (
		body !== null &&
		typeof body === "object" &&
		"access_token" in body &&
		typeof (body as { access_token: unknown }).access_token === "string" &&
		"refresh_token" in body &&
		typeof (body as { refresh_token: unknown }).refresh_token === "string" &&
		"expires_in" in body &&
		typeof (body as { expires_in: unknown }).expires_in === "number"
	) {
		return { kind: "token", data: body as DeviceToken };
	}
	const record = (body ?? {}) as { error?: unknown; error_description?: unknown };
	const error = typeof record.error === "string" ? record.error : "unknown";
	const description = typeof record.error_description === "string" ? record.error_description : undefined;
	return { kind: "error", data: { error, error_description: description } };
}

export async function exchangeDeviceCode(deviceCode: string): Promise<DeviceResponse> {
	const body = await postForm<unknown>(
		`${CONSOLE}/auth/device/token`,
		{
			grant_type: "urn:ietf:params:oauth:grant-type:device_code",
			device_code: deviceCode,
			client_id: CLIENT_ID,
		},
		{ allowHttp400: true },
	);
	return asDeviceResponse(body);
}

export async function refreshAccessToken(refreshToken: string): Promise<DeviceToken> {
	return postForm<DeviceToken>(`${CONSOLE}/auth/device/token`, {
		grant_type: "refresh_token",
		refresh_token: refreshToken,
		client_id: CLIENT_ID,
	});
}

export async function fetchJson<T>(
	url: string,
	token: string,
	extraHeaders: Record<string, string> = {},
): Promise<T> {
	const response = await fetch(url, { headers: { ...bearerHeaders(token), ...extraHeaders } });
	const text = await readText(response);
	if (!response.ok) {
		throw new HttpError(response.status, text, `${url}: HTTP ${response.status}: ${text.slice(0, 200)}`);
	}
	return tryParse<T>(text);
}

export async function fetchWithWorkspace<T>(
	url: string,
	token: string,
	workspaceId: string,
): Promise<T> {
	return fetchJson<T>(url, token, { "x-org-id": workspaceId });
}

export async function ensureFreshCredential(current: Credential): Promise<Credential> {
	if (Date.now() < current.expires - 60_000) return current;
	const fresh = await refreshAccessToken(current.refresh);
	const next: Credential = {
		access: fresh.access_token,
		refresh: fresh.refresh_token,
		expires: Date.now() + fresh.expires_in * 1000,
		identity: current.identity,
		storedAt: Date.now(),
	};
	await saveCredential(next);
	return next;
}

export async function readFreshCredential(): Promise<Credential | null> {
	const current = await loadCredential();
	if (!current) return null;
	return ensureFreshCredential(current);
}

