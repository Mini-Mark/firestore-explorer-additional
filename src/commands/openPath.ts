import * as vscode from "vscode";
import initializeFirestore from "../utilities/initializeFirestore";
import { openDocument } from "./openDocument";
import ExplorerDataProvider from "../explorer/ExplorerDataProvider";
import { DocumentItem, CollectionItem } from "../explorer/items";

/**
 * Open a generic Firestore path. If the path is a document, it will be opened in the editor.
 * Collection paths are not currently supported.
 * @param  {string} path?
 * @param  {vscode.TreeView<any>} treeView?
 * @param  {ExplorerDataProvider} dataProvider?
 */
export default async function openPath(
	path?: string,
	treeView?: vscode.TreeView<any>,
	dataProvider?: ExplorerDataProvider
): Promise<void> {
	path =
		path ??
		(await vscode.window.showInputBox({
			placeHolder: "Firestore Path",
		}));
	if (path !== undefined) {
		const firestore = await initializeFirestore();

		try {
			const parts = path.split("/");
			if (parts.length % 2 === 0) {
				// The path refers to a document
				const doc = firestore.doc(path);
				openDocument(doc);

				// Reveal the document in the tree view
				if (treeView && dataProvider) {
					await revealDocumentInTree(path, treeView, dataProvider);
				}
			} else {
				// The path refers to a collection
				vscode.window.showErrorMessage(
					"Only document paths are supported"
				);
				// TODO: handle collections (e.g. reveal in the tree view)
			}
		} catch (e) {
			console.error(e);
			throw new Error("Invalid path");
		}
	}
}

/**
 * Reveal a document in the tree view by expanding all parent nodes
 * Forces loading all items in parent collections to ensure the document is visible
 */
async function revealDocumentInTree(
	documentPath: string,
	treeView: vscode.TreeView<any>,
	dataProvider: ExplorerDataProvider
): Promise<void> {
	try {
		const firestore = await initializeFirestore();
		const parts = documentPath.split("/");

		console.log(`[DEBUG] Starting reveal for document: ${documentPath}`);

		// First, force load all items in all parent collections
		// This ensures the document will be visible even if it's beyond the initial 10-item limit
		for (let i = 0; i < parts.length; i++) {
			const isCollection = i % 2 === 0;
			if (isCollection) {
				const collectionPath = parts.slice(0, i + 1).join("/");
				console.log(
					`[DEBUG] Force loading all items in collection: ${collectionPath}`
				);
				await dataProvider.showMoreItems(collectionPath);
			}
		}

		// Longer delay to allow tree to fully update after loading
		await new Promise((resolve) => setTimeout(resolve, 300));

		// Build and expand the tree hierarchy step by step
		let currentItem: CollectionItem | DocumentItem | undefined;

		for (let i = 0; i < parts.length; i++) {
			const isCollection = i % 2 === 0;

			if (isCollection) {
				// This is a collection
				const collectionRef = currentItem
					? (currentItem as DocumentItem).reference.collection(
							parts[i]
					  )
					: firestore.collection(parts[i]);

				currentItem = new CollectionItem(parts[i], collectionRef);

				// Expand this collection in the tree (except the last one if it's a collection)
				if (i < parts.length - 1) {
					console.log(`[DEBUG] Expanding collection: ${parts[i]}`);
					try {
						await treeView.reveal(currentItem, {
							select: false,
							focus: false,
							expand: true,
						});
						// Wait for expansion to complete
						await new Promise((resolve) =>
							setTimeout(resolve, 150)
						);
					} catch (e) {
						console.log(
							`[DEBUG] Could not expand collection ${parts[i]}:`,
							e
						);
					}
				}
			} else {
				// This is a document
				const docRef = (currentItem as CollectionItem).reference.doc(
					parts[i]
				);
				const newDocItem = new DocumentItem(parts[i], docRef);

				// If this is not the final document, expand it to show subcollections
				if (i < parts.length - 1) {
					currentItem = newDocItem;
					console.log(`[DEBUG] Expanding document: ${parts[i]}`);
					try {
						await treeView.reveal(currentItem, {
							select: false,
							focus: false,
							expand: true,
						});
						// Wait for expansion to complete
						await new Promise((resolve) =>
							setTimeout(resolve, 150)
						);
					} catch (e) {
						console.log(
							`[DEBUG] Could not expand document ${parts[i]}:`,
							e
						);
					}
				} else {
					// This is the final document - select and focus it
					currentItem = newDocItem;
				}
			}
		}

		// Final reveal with selection, focus, and expansion on the target document
		if (currentItem) {
			console.log(`[DEBUG] Final reveal of document: ${documentPath}`);

			// First reveal to make it visible
			await treeView.reveal(currentItem, {
				select: true,
				focus: false,
				expand: 1, // Expand one level to show subcollections
			});

			// Small delay then focus
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Focus on the tree view
			await vscode.commands.executeCommand(
				"firestore-explorer-view.focus"
			);

			console.log(`[DEBUG] Document revealed and focused successfully`);
		}
	} catch (error) {
		console.error("Failed to reveal document in tree:", error);
		// Don't show error to user - revealing is a nice-to-have feature
	}
}
