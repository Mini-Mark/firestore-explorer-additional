import * as vscode from "vscode";
import { Item, KeyItem } from "../explorer/items";
/**
 * Copy the Tree View item path to the clipboard.
 * @param  {Item} item
 */
export default async function copyPath(item: Item) {
	if (item instanceof KeyItem) {
		vscode.env.clipboard.writeText(item.reference);
	} else {
		vscode.env.clipboard.writeText((item.reference as any).path);
	}
}
