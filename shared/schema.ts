import { z } from "zod";

export const usageAccountInputSchema = z
	.object({
		workspaceId: z.string().min(1),
	})
	.strict();
export type UsageAccountInput = z.infer<typeof usageAccountInputSchema>;

export const connectStatusSchema = z.enum([
	"idle",
	"pending",
	"approved",
	"denied",
	"expired",
	"connected",
]);
export type ConnectStatus = z.infer<typeof connectStatusSchema>;

export const connectStateSchema = z
	.object({
		status: connectStatusSchema,
		userCode: z.string().nullish(),
		verificationUri: z.string().url().nullish(),
		expiresAt: z.number().nullish(),
		pollIntervalSeconds: z.number().nullish(),
		identityEmail: z.string().nullish(),
		workspaceCount: z.number().nullish(),
		error: z.string().nullish(),
	})
	.strict();
export type ConnectState = z.infer<typeof connectStateSchema>;

export const workspaceEntrySchema = z
	.object({
		id: z.string().min(1),
		name: z.string().min(1),
		selected: z.boolean(),
	})
	.strict();
export type WorkspaceEntry = z.infer<typeof workspaceEntrySchema>;

export const listWorkspacesOutputSchema = z
	.object({
		entries: z.array(workspaceEntrySchema),
	})
	.strict();
export type ListWorkspacesOutput = z.infer<typeof listWorkspacesOutputSchema>;

export const saveSelectionInputSchema = z
	.object({
		workspaceIds: z.array(z.string().min(1)),
	})
	.strict();
export type SaveSelectionInput = z.infer<typeof saveSelectionInputSchema>;

export const saveSelectionOutputSchema = z
	.object({ ok: z.boolean() })
	.strict();
export type SaveSelectionOutput = z.infer<typeof saveSelectionOutputSchema>;
