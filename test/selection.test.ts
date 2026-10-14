import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	ensureSeeded,
	loadSelection,
	saveSelection,
	selectionPath,
	selectionStatus,
} from "../server/selection.ts";
let installed: string | null = null;

beforeEach(() => {
	installed = mkdtempSync(join(tmpdir(), "paseo-selection-"));
	process.env.XDG_DATA_HOME = installed;
});

afterEach(() => {
	if (installed) {
		rmSync(installed, { recursive: true, force: true });
		installed = null;
	}
	delete process.env.XDG_DATA_HOME;
});

describe("selection store", () => {
	test("returns null when no file exists", async () => {
		expect(await loadSelection()).toBeNull();
	});

	test("round-trips a selection through disk", async () => {
		await saveSelection(["wrk_a", "wrk_b"]);
		expect(await loadSelection()).toEqual({ workspaceIds: ["wrk_a", "wrk_b"] });
	});

	test("writes the file with mode 0600", async () => {
		await saveSelection(["wrk_a"]);
		const mode = statSync(selectionPath()).mode & 0o777;
		expect(mode).toBe(0o600);
	});

	test("ensureSeeded writes a new file when missing", async () => {
		const result = await ensureSeeded(["wrk_a", "wrk_b"]);
		expect(result).toEqual({ workspaceIds: ["wrk_a", "wrk_b"] });
		expect(await loadSelection()).toEqual({ workspaceIds: ["wrk_a", "wrk_b"] });
	});

	test("ensureSeeded keeps an existing file untouched even when orgs differ", async () => {
		await saveSelection(["wrk_a"]);
		const result = await ensureSeeded(["wrk_a", "wrk_b", "wrk_c"]);
		expect(result).toEqual({ workspaceIds: ["wrk_a"] });
		expect(await loadSelection()).toEqual({ workspaceIds: ["wrk_a"] });
	});

	test("ensureSeeded is a no-op when an existing file has zero entries", async () => {
		await saveSelection([]);
		const result = await ensureSeeded(["wrk_a", "wrk_b"]);
		expect(result).toEqual({ workspaceIds: [] });
	});

	test("saveSelection dedupes input ids", async () => {
		await saveSelection(["wrk_a", "wrk_a", "wrk_b", "wrk_a"]);
		expect(await loadSelection()).toEqual({ workspaceIds: ["wrk_a", "wrk_b"] });
	});

	test("saveSelection drops empty and non-string entries", async () => {
		await saveSelection(["wrk_a", "", "wrk_b"] as string[]);
		expect(await loadSelection()).toEqual({ workspaceIds: ["wrk_a", "wrk_b"] });
	});

	test("returns null when stored file is corrupt", async () => {
		const fs = await import("node:fs/promises");
		const path = selectionPath();
		await fs.mkdir(path.replace(/\/selection\.json$/, ""), { recursive: true });
		await fs.writeFile(path, "not-json");
		expect(await loadSelection()).toBeNull();
	});

	test("returns null when stored file has wrong shape", async () => {
		const fs = await import("node:fs/promises");
		const path = selectionPath();
		await fs.mkdir(path.replace(/\/selection\.json$/, ""), { recursive: true });
		await fs.writeFile(path, JSON.stringify({ wrong: "shape" }));
		expect(await loadSelection()).toBeNull();
	});


	test("selectionStatus reports absent when the file is missing", async () => {
		expect(await selectionStatus()).toEqual({ kind: "absent" });
	});

	test("selectionStatus reports valid for a well-formed file", async () => {
		await saveSelection(["wrk_a"]);
		expect(await selectionStatus()).toEqual({
			kind: "valid",
			value: { workspaceIds: ["wrk_a"] },
		});
	});

	test("selectionStatus reports corrupt for a non-JSON file", async () => {
		const fs = await import("node:fs/promises");
		const path = selectionPath();
		await fs.mkdir(path.replace(/\/selection\.json$/, ""), { recursive: true });
		await fs.writeFile(path, "not-json");
		expect(await selectionStatus()).toEqual({ kind: "corrupt" });
	});

	test("ensureSeeded leaves a corrupt file untouched and returns empty", async () => {
		const fs = await import("node:fs/promises");
		const path = selectionPath();
		await fs.mkdir(path.replace(/\/selection\.json$/, ""), { recursive: true });
		await fs.writeFile(path, "not-json");
		const result = await ensureSeeded(["wrk_a", "wrk_b"]);
		expect(result).toEqual({ workspaceIds: [] });
		expect(await loadSelection()).toBeNull();
		const raw = await fs.readFile(path, "utf8");
		expect(raw).toBe("not-json");
	});
});
