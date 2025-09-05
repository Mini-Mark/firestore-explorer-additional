import * as vscode from "vscode";
import {
	Item,
	KeyItem,
	NestedKeyItem,
	CollectionItem,
	DocumentItem,
} from "../explorer/items";

/**
 * Copy the Tree View item path to the clipboard.
 * The path format depends on the current view mode:
 * - Firebase mode: Firestore path (e.g., "workspace/collection_uids/users/document_id")
 * - Detailed mode: JSON path (e.g., "workspace.users[0].name.surname")
 * @param  {Item} item
 */
export default async function copyPath(item: Item) {
	const config = vscode.workspace.getConfiguration("firestore-explorer");
	const viewMode = config.get("viewMode") as string;

	let pathToCopy: string;

	if (
		viewMode === "detailed" &&
		(item instanceof KeyItem || item instanceof NestedKeyItem)
	) {
		// Detailed mode: Generate JSON-style path for keys
		pathToCopy = generateJsonPath(item);
	} else {
		// Firebase mode: Generate Firestore path for collections/documents
		pathToCopy = generateFirestorePath(item);
	}

	await vscode.env.clipboard.writeText(pathToCopy);
	vscode.window.showInformationMessage(`Path copied: ${pathToCopy}`);
}

/**
 * Generates a Firestore-style path for collections and documents
 * Format: "collection/document/subcollection/subdocument"
 */
function generateFirestorePath(item: Item): string {
	if (item instanceof KeyItem) {
		// In firebase mode, key items shouldn't exist, but handle gracefully
		return item.reference;
	} else if (item instanceof NestedKeyItem) {
		// In firebase mode, nested key items shouldn't exist, but handle gracefully
		return item.reference;
	} else {
		// CollectionItem or DocumentItem
		return (item.reference as any).path;
	}
}

/**
 * Generates a JSON-style path for keys and nested properties
 * Format: "collectionName[0].keyName.nestedKey"
 */
function generateJsonPath(item: KeyItem | NestedKeyItem): string {
	if (item instanceof KeyItem) {
		// Convert collection path to JSON format and add key
		const jsonCollectionPath = convertFirestorePathToJson(
			item.collectionPath
		);
		return `${jsonCollectionPath}.${item.keyName}`;
	} else if (item instanceof NestedKeyItem) {
		// For nested keys, build the full JSON path
		const jsonCollectionPath = convertFirestorePathToJson(
			item.collectionPath
		);

		// Extract the key path from the parent key path
		// parentKeyPath format: "collectionPath/parentKey" or "collectionPath/parentKey.nestedKey"
		const parentKeyPathParts = item.parentKeyPath.split("/");
		const keyPathAfterCollection = parentKeyPathParts.slice(1).join("/"); // Remove collection path

		// Convert the key path to JSON notation (replace slashes and add the current nested key)
		const fullKeyPath = keyPathAfterCollection
			? `${keyPathAfterCollection.replace(/\//g, ".")}.${
					item.nestedKeyName
			  }`
			: item.nestedKeyName;

		return `${jsonCollectionPath}.${fullKeyPath}`;
	}

	return "";
}

/**
 * Converts a Firestore path to JSON-style notation
 * "users/user123/posts" becomes "users[0].posts"
 * "workspace/items" becomes "workspace.items"
 */
function convertFirestorePathToJson(firestorePath: string): string {
	const segments = firestorePath.split("/");
	const jsonPath: string[] = [];

	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i];

		if (i % 2 === 0) {
			// Even index = collection
			jsonPath.push(segment);
		} else {
			// Odd index = document, represent as array access
			jsonPath[jsonPath.length - 1] += "[0]";

			// If there's a next segment (subcollection), add it
			if (i + 1 < segments.length) {
				// Don't add the document ID to the path, just prepare for next collection
			}
		}
	}

	return jsonPath.join(".");
}
