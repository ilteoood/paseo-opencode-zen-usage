import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRpc } from "@getpaseo/plugin/client";
import { listWorkspacesRpc, saveSelectionRpc } from "../shared/connect.ts";
import type { WorkspaceEntry } from "../shared/schema.ts";
import type { StyleSheet } from "./styles.ts";

interface WorkspacesPickerProps {
	styles: StyleSheet;
	compact: boolean;
}

export function WorkspacesPicker({ styles, compact }: WorkspacesPickerProps) {
	const list = useRpc(listWorkspacesRpc);
	const save = useRpc(saveSelectionRpc);
	const [entries, setEntries] = useState<WorkspaceEntry[] | null>(null);
	const [initial, setInitial] = useState<Set<string>>(new Set());
	const [staged, setStaged] = useState<Set<string>>(new Set());
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const result = await list({});
				if (cancelled) return;
				const next = result?.entries ?? [];
				setEntries(next);
				const selected = new Set(next.filter((entry) => entry.selected).map((entry) => entry.id));
				setInitial(selected);
				setStaged(selected);
			} catch (cause) {
				if (!cancelled) {
					setEntries([]);
					setError(messageOf(cause));
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const diffCount = useMemo(() => {
		let moves = 0;
		for (const id of staged) if (!initial.has(id)) moves++;
		for (const id of initial) if (!staged.has(id)) moves++;
		return moves;
	}, [initial, staged]);

	const toggle = (id: string) => {
		setStaged((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const onApply = async () => {
		if (diffCount === 0) return;
		setBusy(true);
		setError(null);
		try {
			await save({ workspaceIds: Array.from(staged) });
			setInitial(new Set(staged));
		} catch (cause) {
			setError(messageOf(cause));
		} finally {
			setBusy(false);
		}
	};

	if (entries === null) return <ActivityIndicator color={styles.text} />;

	if (entries.length === 0) {
		return (
			<Text style={{ color: styles.textMuted, fontSize: 13 }}>No workspaces available.</Text>
		);
	}

	return (
		<View style={{ gap: compact ? 6 : 10 }}>
			{entries.map((entry) => (
				<Pressable
					key={entry.id}
					onPress={() => entry.present && toggle(entry.id)}
					disabled={!entry.present}
					style={({ pressed }) => ({
						flexDirection: "row",
						alignItems: "center",
						gap: 12,
						paddingVertical: 8,
						paddingHorizontal: 4,
						borderRadius: 6,
						opacity: entry.present ? (pressed ? 0.7 : 1) : 0.4,
					})}
				>
					<Checkbox checked={staged.has(entry.id)} accent={styles.accent} />
					<View style={{ flex: 1 }}>
						<Text style={{ color: styles.text, fontSize: 14 }} numberOfLines={1}>
							{entry.name}
						</Text>
						<Text
							style={{ color: styles.textMuted, fontFamily: styles.code, fontSize: 11 }}
							numberOfLines={1}
						>
							{entry.id}
						</Text>
						{!entry.present ? (
							<Text style={{ color: styles.danger, fontSize: 11 }}>no longer in your orgs</Text>
						) : null}
					</View>
				</Pressable>
			))}
			{error ? <Text style={{ color: styles.danger, fontSize: 12 }}>{error}</Text> : null}
			<Pressable
				onPress={onApply}
				disabled={busy || diffCount === 0}
				style={({ pressed }) => pickerButton(styles, pressed, busy || diffCount === 0)}
			>
				{busy ? (
					<ActivityIndicator color={styles.accentForeground} />
				) : (
					<Text style={{ color: styles.accentForeground, fontWeight: "600" }}>
						{diffCount === 0 ? "Apply" : `Apply (${diffCount})`}
					</Text>
				)}
			</Pressable>
		</View>
	);
}

function Checkbox({ checked, accent }: { checked: boolean; accent: string }) {
	return (
		<View
			style={{
				width: 18,
				height: 18,
				borderRadius: 4,
				borderWidth: 2,
				borderColor: accent,
				backgroundColor: checked ? accent : "transparent",
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			{checked ? <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>✓</Text> : null}
		</View>
	);
}

function pickerButton(styles: StyleSheet, pressed: boolean, busy: boolean) {
	return {
		marginTop: 4,
		paddingVertical: 10,
		paddingHorizontal: 16,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: styles.accent,
		alignItems: "center" as const,
		opacity: pressed || busy ? 0.6 : 1,
		backgroundColor: pressed ? styles.accent : "transparent",
	};
}

function messageOf(cause: unknown): string {
	if (cause instanceof Error) return cause.message;
	return String(cause);
}
