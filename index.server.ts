import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
	disconnect,
	pollDeviceSession,
	startDeviceSession,
} from "./server/auth.ts";
import { readFreshCredential } from "./server/plumbing.ts";
import { listOrgs } from "./server/orgs.ts";
import type { Credential } from "./server/types.ts";
import { saveSelection } from "./server/selection.ts";
import { listWorkspacesForUsage, opencodeZenUsageSource } from "./server/usage.ts";
import {
	disconnectConnectRpc,
	listWorkspacesRpc,
	pollConnectRpc,
	saveSelectionRpc,
	startConnectRpc,
	statusConnectRpc,
} from "./shared/connect.ts";

function messageOf(cause: unknown): string {
	return cause instanceof Error ? cause.message : String(cause);
}

async function hydrateWorkspaceCount(credential: Credential): Promise<number | undefined> {
	try {
		const orgs = await listOrgs(credential.access);
		return orgs.length;
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
			const credential = await readFreshCredential();
			if (credential) {
				state.workspaceCount = await hydrateWorkspaceCount(credential);
			}
		}
		return state;
	});

	server.handle(statusConnectRpc, async () => {
		const credential = await readFreshCredential();
		if (!credential) {
			return { status: "idle" as const };
		}
		return {
			status: "connected" as const,
			identityEmail: credential.identity.email,
		};
	});
	server.handle(disconnectConnectRpc, async () => {
		return disconnect();
	});

	server.handle(listWorkspacesRpc, async () => {
		const credential = await readFreshCredential();
		if (!credential) return { entries: [], totalCount: null, error: "not connected" };
		try {
			return await listWorkspacesForUsage(credential.access);
		} catch (cause) {
			return { entries: [], totalCount: null, error: messageOf(cause) };
		}
	});

	server.handle(saveSelectionRpc, async ({ workspaceIds }) => {
		await saveSelection(workspaceIds);
		return { ok: true };
	});

	return () => {};
}
