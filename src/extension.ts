import * as vscode from "vscode";
import * as admin from "firebase-admin";
import copyPath from "./commands/copyPath";
import copyJson from "./commands/copyJson";
import init from "./commands/init";
import orderBy from "./commands/oderBy";
import openPath from "./commands/openPath";
import openServiceAccountSettings from "./commands/openServiceAccountSettings";
import pinItem from "./commands/pinItem";
import unpinItem from "./commands/unpinItem";
import toggleViewMode from "./commands/toggleViewMode";
import { scheme } from "./constants";
import { DocumentFileSystemProvider } from "./editor/DocumentFileSystemProvider";
import ExplorerDataProvider from "./explorer/ExplorerDataProvider";
import PinnedDataProvider from "./explorer/PinnedDataProvider";
import { Item } from "./explorer/items";
import initializeFirestore from "./utilities/initializeFirestore";
import openWithPromptGenerate from "./commands/openWithPromptGenerate";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	const explorerDataProvider = new ExplorerDataProvider();
	const pinnedDataProvider = new PinnedDataProvider(explorerDataProvider);

	const explorerView = vscode.window.createTreeView(
		"firestore-explorer-view",
		{
			treeDataProvider: explorerDataProvider,
		}
	);

	const pinnedView = vscode.window.createTreeView("firestore-pinned-view", {
		treeDataProvider: pinnedDataProvider,
	});

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"firestore-explorer.setServiceAccountKeyPath",
			openServiceAccountSettings
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("firestore-explorer.init", init)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("firestore-explorer.openPath", openPath)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"firestore-explorer.refreshExplorer",
			() => explorerDataProvider.refresh()
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("firestore-explorer.copyPath", copyPath)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("firestore-explorer.copyJson", copyJson)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"firestore-explorer.orderBy",
			(item: Item) => orderBy(item, explorerDataProvider)
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"firestore-explorer.showMoreItems",
			(path: string) => explorerDataProvider.showMoreItems(path)
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"firestore-pinned.showMoreItems",
			(path: string) => pinnedDataProvider.showMoreItems(path)
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"firestore-explorer.toggleViewMode",
			async () => {
				await toggleViewMode();
				explorerDataProvider.refresh();
				pinnedDataProvider.refresh();
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"firestore-explorer.pinItem",
			async (item: Item) => {
				await pinItem(item, explorerDataProvider);
				pinnedDataProvider.refreshItem(); // Refresh pinned panel
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"firestore-explorer.unpinItem",
			async (item: Item) => {
				await unpinItem(item, explorerDataProvider);
				pinnedDataProvider.refreshItem(); // Refresh pinned panel
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"firestore-explorer.openWithPromptGenerate",
			(item: Item) => {
				// Only works for DocumentItem which has a DocumentReference
				if (
					"reference" in item &&
					item.reference &&
					typeof item.reference === "object" &&
					"path" in item.reference
				) {
					return openWithPromptGenerate(
						item.reference as admin.firestore.DocumentReference
					);
				}
			}
		)
	);
	context.subscriptions.push(explorerView);
	context.subscriptions.push(pinnedView);

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(() => {
			initializeFirestore(true);
			explorerDataProvider.refresh();
			pinnedDataProvider.refresh();
		})
	);

	context.subscriptions.push(
		vscode.workspace.registerFileSystemProvider(
			scheme,
			new DocumentFileSystemProvider(),
			{ isCaseSensitive: true }
		)
	);
}

// this method is called when your extension is deactivated
export function deactivate() {}
