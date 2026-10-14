import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import {
	connectStateSchema,
	listWorkspacesOutputSchema,
	saveSelectionInputSchema,
	saveSelectionOutputSchema,
} from "./schema.ts";

export const startConnectRpc = defineRpc({
	name: "opencode-zen.connect.start",
	input: z.object({}).strict(),
	output: connectStateSchema,
});

export const pollConnectRpc = defineRpc({
	name: "opencode-zen.connect.poll",
	input: z.object({}).strict(),
	output: connectStateSchema,
});

export const statusConnectRpc = defineRpc({
	name: "opencode-zen.connect.status",
	input: z.object({}).strict(),
	output: connectStateSchema,
});

export const disconnectConnectRpc = defineRpc({
	name: "opencode-zen.connect.disconnect",
	input: z.object({}).strict(),
	output: z.object({ ok: z.boolean() }).strict(),
});

export const connectRpcs = [startConnectRpc, pollConnectRpc, statusConnectRpc, disconnectConnectRpc] as const;

export const listWorkspacesRpc = defineRpc({
	name: "opencode-zen.workspaces.list",
	input: z.object({}).strict(),
	output: listWorkspacesOutputSchema,
});

export const saveSelectionRpc = defineRpc({
	name: "opencode-zen.workspaces.save",
	input: saveSelectionInputSchema,
	output: saveSelectionOutputSchema,
});

export const workspaceRpcs = [listWorkspacesRpc, saveSelectionRpc] as const;
