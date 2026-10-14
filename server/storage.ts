import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const STORAGE_SUBDIR = "paseo-opencode-zen-usage";

export function resolveStorageDir(): string {
	const xdgData = process.env.XDG_DATA_HOME;
	if (xdgData && xdgData.trim().length > 0) return resolve(xdgData);
	return join(homedir(), ".local", "share");
}

export function storagePath(filename: string): string {
	return join(resolveStorageDir(), STORAGE_SUBDIR, filename);
}

export async function readJsonFile(path: string): Promise<string | null> {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
		throw error;
	}
}

export async function writeJsonAtomic<T>(path: string, value: T): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
	await writeFile(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
	await chmod(tmp, 0o600);
	await rename(tmp, path);
}
