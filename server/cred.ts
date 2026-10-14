import { readFile, unlink } from "node:fs/promises";
import { storagePath, writeJsonAtomic } from "./storage.ts";
import type { Credential } from "./types.ts";

const CRED_FILENAME = "cred.json";

export function credPath(): string {
	return storagePath(CRED_FILENAME);
}

export async function loadCredential(): Promise<Credential | null> {
	let raw: string;
	try {
		raw = await readFile(credPath(), "utf8");
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
	try {
		await unlink(credPath());
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
	}
}
