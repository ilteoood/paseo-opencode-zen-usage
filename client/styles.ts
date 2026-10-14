import type { PluginTheme } from "@getpaseo/plugin";

export interface StyleSheet {
	background: string;
	surface: string;
	border: string;
	text: string;
	textMuted: string;
	accent: string;
	accentForeground: string;
	danger: string;
	warning: string;
	success: string;
	code: string;
}

export function themedStyles(theme: PluginTheme): StyleSheet {
	return {
		background: theme.colors.surface0,
		surface: theme.colors.surface1,
		border: theme.colors.border,
		text: theme.colors.foreground,
		textMuted: theme.colors.foregroundMuted,
		accent: theme.colors.accent,
		accentForeground: theme.colors.accentForeground,
		danger: theme.colors.statusDanger,
		warning: theme.colors.statusWarning,
		success: theme.colors.statusSuccess,
		code: "Menlo",
	};
}
