import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
	disconnect,
	pollDeviceSession,
	startDeviceSession,
} from "./server/auth.ts";
import { loadCredential } from "./server/cred.ts";
import { fetchJson } from "./server/plumbing.ts";
import { opencodeZenUsageSource } from "./server/usage.ts";
import {
	disconnectConnectRpc,
	pollConnectRpc,
	startConnectRpc,
	statusConnectRpc,
} from "./shared/connect.ts";

async function hydrateWorkspaceCount(wantsCount: boolean): Promise<number | undefined> {
	if (!wantsCount) return undefined;
	const credential = await loadCredential();
	if (!credential) return undefined;
	try {
		const orgs = await fetchJson<unknown[]>(`https://opencode.ai/console/api/orgs`, credential.access);
		return Array.isArray(orgs) ? orgs.length : undefined;
	} catch {
		return undefined;
	}
}

export default function contribute(server: PluginServerContext): () => void {
	server.registerUsageSource(opencodeZenUsageSource);

	server.handle(startConnectRpc, async () => {
		const state = await startDeviceSession();
		return state;
	});

	server.handle(pollConnectRpc, async () => {
		const state = await pollDeviceSession();
		if (state.status === "connected") {
			state.workspaceCount = await hydrateWorkspaceCount(true);
		}
		return state;
	});

	server.handle(statusConnectRpc, async () => {
		const credential = await loadCredential();
		if (!credential) {
			return { status: "idle" as const };
		}
		const workspaceCount = await hydrateWorkspaceCount(true);
		return {
			status: "connected" as const,
			identityEmail: credential.identity.email,
			workspaceCount,
		};
	});

	server.handle(disconnectConnectRpc, async () => {
		return disconnect();
	});

	return () => {};
}
