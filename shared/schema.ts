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
