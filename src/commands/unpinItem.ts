import * as vscode from "vscode";
import { Item } from "../explorer/items";

/**
 * Unpin an item from the top of the tree view
 * @param {Item} item - The tree item to unpin
 * @param {any} explorerDataProvider - The explorer data provider instance
 */
export default async function unpinItem(
	item: Item,
	explorerDataProvider: any
): Promise<void> {
	try {
		await explorerDataProvider.unpinItem(item);
		vscode.window.showInformationMessage(
			`Unpinned "${item.label}" from the top`
		);
	} catch (error) {
		vscode.window.showErrorMessage(
			`Failed to unpin item: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}
