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

export interface ButtonOptions {
	pressed: boolean;
	busy: boolean;
	variant?: "primary" | "danger";
	fill?: boolean;
	marginTop?: number;
}

export function button(styles: StyleSheet, options: ButtonOptions) {
	const color = options.variant === "danger" ? styles.danger : styles.accent;
	return {
		marginTop: options.marginTop ?? 0,
		paddingVertical: 12,
		paddingHorizontal: 16,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: color,
		alignItems: "center" as const,
		opacity: options.pressed || options.busy ? 0.6 : 1,
		backgroundColor: options.pressed && options.fill ? color : "transparent",
	};
}
