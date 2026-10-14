import { storagePath, readJsonFile, writeJsonAtomic } from "./storage.ts";

export interface Selection {
	workspaceIds: string[];
}

const SELECTION_FILENAME = "selection.json";

export function selectionPath(): string {
	return storagePath(SELECTION_FILENAME);
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

export type SelectionStatus =
	| { kind: "absent" }
	| { kind: "valid"; value: Selection }
	| { kind: "corrupt" };

export async function selectionStatus(): Promise<SelectionStatus> {
	const raw = await readJsonFile(selectionPath());
	if (raw === null) return { kind: "absent" };
	const value = parseSelection(raw);
	return value ? { kind: "valid", value } : { kind: "corrupt" };
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

export async function ensureSeeded(orgIds: string[]): Promise<Selection> {
	const status = await selectionStatus();
	if (status.kind === "valid") return status.value;
	if (status.kind === "corrupt") return { workspaceIds: [] };
	const seeded: Selection = { workspaceIds: [...orgIds] };
	await writeJsonAtomic(selectionPath(), seeded);
	return seeded;
}
