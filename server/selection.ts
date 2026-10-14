import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export interface Selection {
	workspaceIds: string[];
}

function resolveStorageDir(): string {
	const xdgData = process.env.XDG_DATA_HOME;
	if (xdgData && xdgData.trim().length > 0) return resolve(xdgData);
	return join(homedir(), ".local", "share");
}

export function selectionPath(): string {
	return join(resolveStorageDir(), "paseo-opencode-zen-usage", "selection.json");
}

export const SELECTION_PATH = selectionPath;

async function writeJsonAtomic(path: string, value: Selection): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.${process.pid}.tmp`;
	await writeFile(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
	await chmod(tmp, 0o600);
	await rename(tmp, path);
}

function parseSelection(raw: string): Selection | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw) as unknown;
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== "object") return null;
	const ids = (parsed as { workspaceIds?: unknown }).workspaceIds;
	if (!Array.isArray(ids)) return null;
	const workspaceIds: string[] = [];
	for (const entry of ids) {
		if (typeof entry !== "string" || entry.length === 0) continue;
		if (!workspaceIds.includes(entry)) workspaceIds.push(entry);
	}
	return { workspaceIds };
}

export async function loadSelection(): Promise<Selection | null> {
	const status = await selectionStatus();
	return status.kind === "valid" ? status.value : null;
}

export async function saveSelection(workspaceIds: string[]): Promise<void> {
	const seen = new Set<string>();
	const deduped: string[] = [];
	for (const entry of workspaceIds) {
		if (typeof entry !== "string" || entry.length === 0) continue;
		if (seen.has(entry)) continue;
		seen.add(entry);
		deduped.push(entry);
	}
	await writeJsonAtomic(selectionPath(), { workspaceIds: deduped });
}

export type SelectionStatus =
	| { kind: "absent" }
	| { kind: "valid"; value: Selection }
	| { kind: "corrupt" };

export async function selectionStatus(): Promise<SelectionStatus> {
	const path = selectionPath();
	let raw: string;
	try {
		raw = await readFile(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return { kind: "absent" };
		throw error;
	}
	const value = parseSelection(raw);
	return value ? { kind: "valid", value } : { kind: "corrupt" };
}

export async function ensureSeeded(orgIds: string[]): Promise<Selection> {
	const status = await selectionStatus();
	if (status.kind === "valid") return status.value;
	if (status.kind === "corrupt") return { workspaceIds: [] };
	const seeded: Selection = { workspaceIds: [...orgIds] };
	await writeJsonAtomic(selectionPath(), seeded);
	return seeded;
}
