import { CONSOLE, fetchJson } from "./plumbing.ts";
import type { Org } from "./types.ts";

export async function listOrgs(token: string): Promise<Org[]> {
	const list = await fetchJson<Org[] | { orgs?: Org[] }>(`${CONSOLE}/api/orgs`, token);
	const records = Array.isArray(list) ? list : (list.orgs ?? []);
	return records
		.filter((org): org is Org => Boolean(org) && typeof org === "object")
		.map((org) => ({
			id: typeof org.id === "string" ? org.id : "",
			name:
				typeof org.name === "string" && org.name.length > 0
					? org.name
					: typeof org.id === "string"
						? org.id
						: "Workspace",
		}))
		.filter((org) => org.id.length > 0);
}
