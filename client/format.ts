export function messageOf(cause: unknown): string {
	if (cause instanceof Error) return cause.message;
	return String(cause);
}
