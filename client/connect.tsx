import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useRpc } from "@getpaseo/plugin/client";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { ExternalLink } from "@getpaseo/plugin/client/ui";

import {
	disconnectConnectRpc,
	pollConnectRpc,
	startConnectRpc,
	statusConnectRpc,
} from "../shared/connect.ts";
import type { ConnectState } from "../shared/schema.ts";
import { themedStyles, type StyleSheet } from "./styles.ts";
import { WorkspacesPicker } from "./workspaces.tsx";

const IDLE_STATE: ConnectState = { status: "idle" };

export function ConnectScreen({ theme, layout }: PluginScreenProps) {
	const styles = themedStyles(theme);
	const status = useRpc(statusConnectRpc);
	const start = useRpc(startConnectRpc);
	const poll = useRpc(pollConnectRpc);
	const disconnect = useRpc(disconnectConnectRpc);
	const [state, setState] = useState<ConnectState>(IDLE_STATE);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void initialise();
		return () => {
			cancelled = true;
		};
		async function initialise() {
			try {
				const snapshot = await status({});
				if (!cancelled) setState(snapshot ?? IDLE_STATE);
			} catch (cause) {
				if (!cancelled) setError(messageOf(cause));
			}
		}
	}, []);

	useEffect(() => {
		if (state.status !== "pending" || !state.pollIntervalSeconds) return;
		const handle = setTimeout(async () => {
			try {
				const next = await poll({});
				setState(next ?? IDLE_STATE);
			} catch (cause) {
				setError(messageOf(cause));
			}
		}, state.pollIntervalSeconds * 1000);
		return () => clearTimeout(handle);
	}, [state]);

	const onStart = async () => {
		setBusy(true);
		setError(null);
		try {
			const next = await start({});
			setState(next ?? IDLE_STATE);
		} catch (cause) {
			setError(messageOf(cause));
		} finally {
			setBusy(false);
		}
	};

	const onDisconnect = async () => {
		setBusy(true);
		setError(null);
		try {
			await disconnect({});
			setState(IDLE_STATE);
		} catch (cause) {
			setError(messageOf(cause));
		} finally {
			setBusy(false);
		}
	};

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: styles.background }}
			contentContainerStyle={{
				padding: layout.compact ? 16 : 24,
				gap: layout.compact ? 12 : 18,
			}}
		>
			<Text style={{ color: styles.text, fontSize: layout.compact ? 18 : 22, fontWeight: "600" }}>
				OpenCode Zen Usage
			</Text>
			<Text style={{ color: styles.textMuted, fontSize: 13 }}>
				Connect a personal OpenCode Zen account to monitor your monthly budget in the Paseo Usage
				modal.
			</Text>

			<Section title="Status" styles={styles}>
				{state.status === "connected" ? (
					<Text style={{ color: styles.text, fontSize: 14 }}>
						Connected{state.identityEmail ? ` as ${state.identityEmail}` : ""}
						{state.workspaceCount ? ` — ${state.workspaceCount} workspace${state.workspaceCount === 1 ? "" : "s"}` : ""}
					</Text>
				) : state.status === "pending" ? (
					<Pending state={state} styles={styles} layout={layout} />
				) : (
					<Text style={{ color: styles.textMuted, fontSize: 14 }}>Not connected.</Text>
				)}
				{error ? <Text style={{ color: styles.danger, fontSize: 13 }}>{error}</Text> : null}
			</Section>

			{state.status === "connected" ? (
				<Section title="Workspaces" styles={styles}>
					<WorkspacesPicker styles={styles} compact={layout.compact} />
				</Section>
			) : null}

			<Section title="Action" styles={styles}>
				{state.status === "connected" ? (
					<Pressable
						onPress={onDisconnect}
						disabled={busy}
						style={({ pressed }) => buttonStyle(styles, pressed, busy, "danger")}
					>
						{busy ? (
							<ActivityIndicator color={styles.text} />
						) : (
							<Text style={{ color: styles.danger, fontWeight: "600" }}>Disconnect</Text>
						)}
					</Pressable>
				) : state.status !== "pending" ? (
					<Pressable
						onPress={onStart}
						disabled={busy}
						style={({ pressed }) => buttonStyle(styles, pressed, busy, "primary")}
					>
						{busy ? (
							<ActivityIndicator color={styles.text} />
						) : (
							<Text style={{ color: styles.accentForeground, fontWeight: "600" }}>
								Connect OpenCode Zen
							</Text>
						)}
					</Pressable>
				) : (
					<Text style={{ color: styles.textMuted, fontSize: 12 }}>Waiting for browser approval…</Text>
				)}
			</Section>
		</ScrollView>
	);
}

interface SectionProps {
	title: string;
	styles: StyleSheet;
	children: ReactNode;
}

function Section({ title, styles, children }: SectionProps) {
	return (
		<View
			style={{
				padding: 12,
				borderRadius: 10,
				borderWidth: 1,
				borderColor: styles.border,
				gap: 8,
			}}
		>
			<Text style={{ color: styles.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>
				{title}
			</Text>
			{children}
		</View>
	);
}

interface PendingProps {
	state: ConnectState;
	styles: StyleSheet;
	layout: { compact: boolean };
}

function Pending({ state, styles, layout }: PendingProps) {
	if (!state.verificationUri || !state.userCode) {
		return <ActivityIndicator color={styles.text} />;
	}
	return (
		<View style={{ gap: layout.compact ? 6 : 10 }}>
			<Text style={{ color: styles.text, fontSize: 14 }}>Visit this URL and enter the code below.</Text>
			<ExternalLink href={state.verificationUri}>Open browser</ExternalLink>
			<Text
				style={{
					color: styles.accent,
					fontFamily: styles.code,
					fontSize: 18,
					fontWeight: "600",
					letterSpacing: 2,
				}}
			>
				{state.userCode}
			</Text>
			{state.expiresAt ? (
				<Text style={{ color: styles.textMuted, fontSize: 12 }}>
					Expires {expiresInLabel(state.expiresAt)} from now.
				</Text>
			) : null}
		</View>
	);
}

function buttonStyle(styles: StyleSheet, pressed: boolean, busy: boolean, variant: "primary" | "danger") {
	const color = variant === "danger" ? styles.danger : styles.accent;
	return {
		paddingVertical: 12,
		paddingHorizontal: 16,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: color,
		alignItems: "center" as const,
		opacity: pressed || busy ? 0.6 : 1,
	};
}

function expiresInLabel(expiresAt: number): string {
	const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
	const minutes = Math.floor(remaining / 60);
	const seconds = remaining % 60;
	return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function messageOf(cause: unknown): string {
	if (cause instanceof Error) return cause.message;
	return String(cause);
}
