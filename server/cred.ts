import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Credential } from "./types.ts";

function resolveCredDir(): string {
	const xdgData = process.env.XDG_DATA_HOME;
	if (xdgData && xdgData.trim().length > 0) return resolve(xdgData);
	return join(homedir(), ".local", "share");
}

export function credPath(): string {
	return join(resolveCredDir(), "paseo-opencode-zen-usage", "cred.json");
}

export const CRED_PATH = credPath;

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.${process.pid}.tmp`;
	await writeFile(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
	await chmod(tmp, 0o600);
	await rename(tmp, path);
}

export async function loadCredential(): Promise<Credential | null> {
	const path = credPath();
	let raw: string;
	try {
		raw = await readFile(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
		throw error;
	}
	let parsed: Partial<Credential>;
	try {
		parsed = JSON.parse(raw) as Partial<Credential>;
	} catch {
		return null;
	}
	if (
		typeof parsed.access !== "string" ||
		typeof parsed.refresh !== "string" ||
		typeof parsed.expires !== "number" ||
		typeof parsed.storedAt !== "number"
	) {
		return null;
	}
	return {
		access: parsed.access,
		refresh: parsed.refresh,
		expires: parsed.expires,
		storedAt: parsed.storedAt,
		identity: {
			email: typeof parsed.identity?.email === "string" ? parsed.identity.email : null,
			sub: typeof parsed.identity?.sub === "string" ? parsed.identity.sub : null,
		},
	};
}

export async function saveCredential(credential: Credential): Promise<void> {
	await writeJsonAtomic(credPath(), credential);
}

export async function clearCredential(): Promise<void> {
	const path = credPath();
	try {
		await unlink(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
	}
}
