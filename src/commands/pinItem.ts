import * as vscode from "vscode";
import { Item } from "../explorer/items";

/**
 * Pin an item to the top of the tree view
 * @param {Item} item - The tree item to pin
 * @param {any} explorerDataProvider - The explorer data provider instance
 */
export default async function pinItem(
	item: Item,
	explorerDataProvider: any
): Promise<void> {
	try {
		await explorerDataProvider.pinItem(item);
		vscode.window.showInformationMessage(
			`Pinned "${item.label}" to the top`
		);
	} catch (error) {
		vscode.window.showErrorMessage(
			`Failed to pin item: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}
