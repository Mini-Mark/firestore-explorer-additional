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
import openFilter from "./commands/openFilter";

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

	// Handle tree item selection for ShowMoreItemsItem
	explorerView.onDidChangeSelection((e) => {
		console.log(`[DEBUG] Tree view selection changed:`, e.selection);
		if (e.selection.length > 0) {
			const selectedItem = e.selection[0] as any;
			console.log(`[DEBUG] Selected item:`, selectedItem);

			// Check if it's a ShowMoreItemsItem
			if (selectedItem && selectedItem.contextValue === "show-more") {
				console.log(
					`[DEBUG] Show All item selected, triggering showMoreItems`
				);
				const path =
					selectedItem.reference &&
					typeof selectedItem.reference === "object" &&
					"path" in selectedItem.reference
						? selectedItem.reference.path
						: null;
				if (path) {
					console.log(
						`[DEBUG] Executing showMoreItems for path: ${path}`
					);
					vscode.window.showInformationMessage(
						`Loading all items for: ${path}`
					);
					explorerDataProvider.showMoreItems(path);
				} else {
					console.log(
						`[DEBUG] No path found in selected item, reference:`,
						selectedItem.reference
					);
					vscode.window.showErrorMessage(
						"Could not determine collection path"
					);
				}
			}
		}
	});

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
			(pathOrItem?: string | any, ...additionalArgs: any[]) => {
				console.log(`[DEBUG] showMoreItems command called!`);
				console.log(`[DEBUG] pathOrItem type:`, typeof pathOrItem);
				console.log(`[DEBUG] pathOrItem value:`, pathOrItem);
				console.log(`[DEBUG] Additional args:`, additionalArgs);

				vscode.window.showInformationMessage(
					`Show More Items command triggered!`
				);

				let path: string;

				// Handle different ways the command can be called
				if (typeof pathOrItem === "string") {
					// Called with string path (from tree item command arguments)
					path = pathOrItem;
					console.log(`[DEBUG] Using string path: ${path}`);
				} else if (pathOrItem && typeof pathOrItem === "object") {
					// Called with tree item object (from context menu)
					if (pathOrItem.reference && pathOrItem.reference.path) {
						path = pathOrItem.reference.path;
						console.log(`[DEBUG] Using reference path: ${path}`);
					} else if (pathOrItem.path) {
						path = pathOrItem.path;
						console.log(`[DEBUG] Using direct path: ${path}`);
					} else {
						console.log(
							`[DEBUG] Object structure:`,
							JSON.stringify(pathOrItem, null, 2)
						);
						vscode.window.showErrorMessage(
							"Could not determine collection path from object"
						);
						return;
					}
				} else {
					console.log(
						`[DEBUG] No valid argument provided, pathOrItem is:`,
						pathOrItem
					);
					vscode.window.showErrorMessage(
						"No collection path provided to showMoreItems command"
					);
					return;
				}

				console.log(`[DEBUG] Final extracted path: ${path}`);
				vscode.window.showInformationMessage(
					`Loading all items for: ${path}`
				);

				try {
					return explorerDataProvider.showMoreItems(path);
				} catch (error) {
					console.error(`[ERROR] Failed to show more items:`, error);
					vscode.window.showErrorMessage(
						`Failed to load more items: ${error}`
					);
				}
			}
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
			"firestore-explorer.openFilter",
			(item: Item) => {
				// Only works for CollectionItem
				if (
					"reference" in item &&
					item.reference &&
					typeof item.reference === "object" &&
					"path" in item.reference
				) {
					return openFilter(item as any);
				}
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
