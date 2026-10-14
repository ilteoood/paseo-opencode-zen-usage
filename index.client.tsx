import type { PluginClientContext } from "@getpaseo/plugin/client";
import { ConnectScreen } from "./client/connect.tsx";

export default function contribute(client: PluginClientContext): () => void {
	client.addScreen({
		id: "opencode-zen-connect",
		title: "OpenCode Zen Usage",
		Component: ConnectScreen,
	});

	client.addCommandCenterItem({
		id: "opencode-zen-setup",
		title: "Connect OpenCode Zen",
		icon: "Wallet",
		context: "global",
		onSelect(context) {
			context.openScreen({ screenId: "opencode-zen-connect" });
		},
	});

	return () => {};
}
