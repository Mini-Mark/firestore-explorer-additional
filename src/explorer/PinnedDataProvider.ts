import * as admin from "firebase-admin";
import * as vscode from "vscode";

import initializeFirestore from "../utilities/initializeFirestore";
import {
	CollectionItem,
	DocumentItem,
	Item,
	ShowMoreItemsItem,
	PinnedShowMoreItemsItem,
	KeyItem,
	NestedKeyItem,
} from "./items";
import ExplorerDataProvider from "./ExplorerDataProvider";

/**
 * Provides the Pinned Items Tree View data - shows only pinned items and their children.
 */
export default class PinnedDataProvider
	implements vscode.TreeDataProvider<Item>
{
	private _onDidChangeTreeData = new vscode.EventEmitter<Item | undefined>();
	private _paging: { [key: string]: number } = {};
	private _mainProvider: ExplorerDataProvider;
	private _collectionScanCache: {
		[collectionPath: string]: { hassPinned: boolean; lastChecked: number };
	} = {};
	private _cacheTimeout = 30000; // 30 seconds cache

	readonly onDidChangeTreeData: vscode.Event<Item | undefined> =
		this._onDidChangeTreeData.event;

	constructor(mainProvider: ExplorerDataProvider) {
		this._mainProvider = mainProvider;
	}

	refresh(): void {
		// Clear cache when refreshing to ensure accuracy
		this._collectionScanCache = {};
		this._onDidChangeTreeData.fire(undefined);
	}

	/**
	 * Refresh only specific items instead of the entire tree
	 */
	refreshItem(item?: Item): void {
		if (item) {
			// Clear cache for the specific item's collection if applicable
			if (item instanceof DocumentItem && item.reference.parent) {
				delete this._collectionScanCache[item.reference.parent.path];
			} else if (item instanceof CollectionItem) {
				delete this._collectionScanCache[item.reference.path];
			}
		}
		this._onDidChangeTreeData.fire(item);
	}

	async getTreeItem(element: Item): Promise<vscode.TreeItem> {
		// Use the main provider's getTreeItem but ensure pinned items show appropriate context
		const treeItem = await this._mainProvider.getTreeItem(element);

		// Keep the pin emoji for directly pinned items in the pinned panel
		// Don't remove it - this helps distinguish between directly pinned items and parent containers

		// Add visual indicators for documents that contain pinned subcollections
		if (element instanceof DocumentItem) {
			const isDirectlyPinned = this._mainProvider.isItemPinned(element);
			const hassPinnedSubcollections =
				this.documentHasPinnedSubcollections(element);

			if (!isDirectlyPinned && hassPinnedSubcollections) {
				// Document isn't pinned but contains pinned items - add indicator
				if (treeItem.label && typeof treeItem.label === "string") {
					treeItem.label = `${treeItem.label}`;
				}
				treeItem.tooltip = `Contains pinned items\n${
					treeItem.tooltip || ""
				}`;
			}
		}

		// Add visual indicators for collections that contain pinned documents
		if (element instanceof CollectionItem) {
			const isDirectlyPinned = this._mainProvider.isItemPinned(element);

			if (!isDirectlyPinned) {
				// Check if collection contains pinned items
				const hassPinnedItems = await this.collectionHasPinnedDocuments(
					element.reference
				);

				if (hassPinnedItems) {
					// Collection isn't pinned but contains pinned items - add indicator
					if (treeItem.label && typeof treeItem.label === "string") {
						treeItem.label = `${treeItem.label}`;
					}
					treeItem.tooltip = `Contains pinned items\n${
						treeItem.tooltip || ""
					}`;
				}
			}
		}

		// For items in the pinned panel, we want to show the unpin option
		// So we need to ensure they have the appropriate contextValue
		if (treeItem.contextValue) {
			if (!treeItem.contextValue.endsWith("-pinned")) {
				// If this item is actually pinned but doesn't have -pinned suffix, add it
				if (this._mainProvider.isItemPinned(element)) {
					treeItem.contextValue = treeItem.contextValue + "-pinned";
				}
			}
			// If it already has -pinned suffix, keep it as is for unpin functionality
		}

		return treeItem;
	}

	async getParent(element: Item): Promise<Item | undefined> {
		return this._mainProvider.getParent(element);
	}

	async getChildren(
		element?: DocumentItem | CollectionItem | KeyItem | NestedKeyItem
	): Promise<Item[] | undefined> {
		const firestore = await initializeFirestore();

		if (!element) {
			// Root level: show collections that are either pinned themselves
			// or contain pinned documents
			const refs = await firestore.listCollections();
			const collectionsToShow: CollectionItem[] = [];

			for (const ref of refs) {
				const collectionItem = new CollectionItem(ref.id, ref, {
					fieldName: "id",
					direction: "asc",
				});

				// Show if collection is pinned
				if (this._mainProvider.isItemPinned(collectionItem)) {
					collectionsToShow.push(collectionItem);
				} else {
					// Check if collection has any pinned documents
					const hassPinnedDocuments =
						await this.collectionHasPinnedDocuments(ref);
					if (hassPinnedDocuments) {
						collectionsToShow.push(collectionItem);
					}
				}
			}

			return collectionsToShow;
		} else if (element instanceof DocumentItem) {
			// For documents, apply same logic as root collections:
			// If document has pinned subcollections, show only pinned subcollections
			// If document has no pinned subcollections, show all subcollections
			const refs = await element.reference.listCollections();

			const allSubcollections: CollectionItem[] = [];
			const pinnedSubcollections: CollectionItem[] = [];

			for (const ref of refs) {
				const collectionItem = new CollectionItem(ref.id, ref, {
					fieldName: "id",
					direction: "asc",
				});

				allSubcollections.push(collectionItem);

				// Check if this subcollection is pinned
				if (this._mainProvider.isItemPinned(collectionItem)) {
					pinnedSubcollections.push(collectionItem);
				}
			}

			// If document has pinned subcollections, show only pinned subcollections
			// If document has no pinned subcollections, show all subcollections
			return pinnedSubcollections.length > 0
				? pinnedSubcollections
				: allSubcollections;
		} else if (element instanceof CollectionItem) {
			// For collections, show documents
			// If the collection itself is pinned, show all its documents
			// If the collection is not pinned but we're here, show only pinned documents
			return this.getCollectionChildren(element);
		} else if (element instanceof KeyItem) {
			// Get nested keys using main provider logic
			return this._mainProvider.getChildren(element);
		} else if (element instanceof NestedKeyItem) {
			// Get further nested keys using main provider logic
			return this._mainProvider.getChildren(element);
		}
	}

	/**
	 * Gets children for a collection - either all documents (if collection is pinned)
	 * or only pinned documents (if we're browsing through a pinned parent)
	 */
	private async getCollectionChildren(
		element: CollectionItem
	): Promise<Item[]> {
		const config = vscode.workspace.getConfiguration("firestore-explorer");
		const viewMode = config.get("viewMode") as string;

		if (viewMode === "detailed") {
			// In detailed mode, use the main provider's logic for getting keys
			const children = await this._mainProvider.getChildren(element);
			return children || [];
		} else {
			// In structure mode, get documents
			const limit =
				this._paging[element.reference.path] ??
				vscode.workspace
					.getConfiguration()
					.get("firestore-explorer.pagingLimit", 10);

			const snapshots = await element.reference
				.limit(limit + 1)
				.orderBy(admin.firestore.FieldPath.documentId(), "asc")
				.get();

			const allDocuments: DocumentItem[] = [];
			const pinnedDocuments: DocumentItem[] = [];

			snapshots.forEach((snapshot) => {
				const documentItem = new DocumentItem(
					snapshot.id,
					snapshot.ref,
					undefined,
					this.getSampleData(snapshot.data())
				);

				allDocuments.push(documentItem);

				// Check if this document is pinned OR has pinned subcollections
				const isDirectlyPinned =
					this._mainProvider.isItemPinned(documentItem);
				const hassPinnedSubcollections =
					this.documentHasPinnedSubcollections(documentItem);

				if (isDirectlyPinned || hassPinnedSubcollections) {
					pinnedDocuments.push(documentItem);
				}
			});

			// If collection has pinned documents, show only pinned documents
			// If collection has no pinned documents, show all documents
			const itemsToShow =
				pinnedDocuments.length > 0 ? pinnedDocuments : allDocuments;

			if (itemsToShow.length > limit) {
				const documents = itemsToShow.slice(0, limit);
				return [
					...documents,
					new PinnedShowMoreItemsItem(element.reference, limit),
				];
			} else {
				return itemsToShow;
			}
		}
	}

	/**
	 * Get sample data for tooltip display (simplified version)
	 */
	private getSampleData(data: any): any {
		if (!data) {
			return undefined;
		}

		const keys = Object.keys(data);
		if (keys.length === 0) {
			return undefined;
		}

		// Return first 3 fields for sample
		const sample: any = {};
		keys.slice(0, 3).forEach((key) => {
			const value = data[key];
			if (typeof value === "string" && value.length > 30) {
				sample[key] = value.substring(0, 30) + "...";
			} else if (typeof value === "object" && value !== null) {
				sample[key] = "[Object]";
			} else {
				sample[key] = value;
			}
		});

		return sample;
	}

	/**
	 * Show more items for a collection in the pinned panel
	 */
	async showMoreItems(path: string): Promise<void> {
		const defaultLimit = vscode.workspace
			.getConfiguration()
			.get("firestore-explorer.pagingLimit") as number;
		const newLimit = (this._paging[path] ?? defaultLimit) + defaultLimit;
		this._paging[path] = newLimit;
		this.refresh();
	}

	/**
	 * Check if a collection has any pinned documents (with caching)
	 */
	private async collectionHasPinnedDocuments(
		collectionRef: admin.firestore.CollectionReference
	): Promise<boolean> {
		const collectionPath = collectionRef.path;
		const now = Date.now();

		// Check cache first
		const cached = this._collectionScanCache[collectionPath];
		if (cached && now - cached.lastChecked < this._cacheTimeout) {
			return cached.hassPinned;
		}

		try {
			// Quick check: use pinned items set for faster lookup
			let hassPinned = false;

			// First, check if any pinned items match this collection path pattern
			for (const pinnedPath of this._mainProvider.getPinnedItemsPaths()) {
				if (pinnedPath.startsWith(collectionPath + "/")) {
					hassPinned = true;
					break;
				}
			}

			// Cache the result
			this._collectionScanCache[collectionPath] = {
				hassPinned,
				lastChecked: now,
			};

			return hassPinned;
		} catch (error) {
			console.error(
				`Error checking pinned documents in collection ${collectionRef.path}:`,
				error
			);
			return false;
		}
	}

	/**
	 * Check if a document has any pinned subcollections or nested items
	 */
	private documentHasPinnedSubcollections(document: DocumentItem): boolean {
		const documentPath = document.reference.path;

		// Check if any pinned items are under this document's path
		for (const pinnedPath of this._mainProvider.getPinnedItemsPaths()) {
			if (pinnedPath.startsWith(documentPath + "/")) {
				return true;
			}
		}

		return false;
	}
}
