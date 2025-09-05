import * as admin from "firebase-admin";
import * as vscode from "vscode";

import initializeFirestore from "../utilities/initializeFirestore";
import {
	CollectionItem,
	DocumentItem,
	Item,
	ShowMoreItemsItem,
	KeyItem,
	NestedKeyItem,
} from "./items";

/**
 * Provides the Firestore Explorer Tree View data.
 */
export default class ExplorerDataProvider
	implements vscode.TreeDataProvider<Item>
{
	// TODO: Consider using Firestore subscriptions to dynamically update the tree view.
	// TODO: Implement basic queries
	// TODO: Allow to display only a sub-collection

	private _onDidChangeTreeData = new vscode.EventEmitter<Item | undefined>();
	private _paging: { [key: string]: number } = {};
	private _orderBy: {
		[key: string]: {
			field: string | undefined;
			direction: "asc" | "desc";
		};
	} = {};
	private _pinnedItems: Set<string> = new Set();

	constructor() {
		this.loadPinnedItems();
	}

	private loadPinnedItems(): void {
		const config = vscode.workspace.getConfiguration("firestore-explorer");
		const pinnedItems = config.get("pinnedItems") as string[] || [];
		this._pinnedItems = new Set(pinnedItems);
	}

	private async savePinnedItems(): Promise<void> {
		const config = vscode.workspace.getConfiguration("firestore-explorer");
		await config.update("pinnedItems", Array.from(this._pinnedItems), vscode.ConfigurationTarget.Workspace);
	}

	readonly onDidChangeTreeData: vscode.Event<Item | undefined> =
		this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	async getTreeItem(element: Item): Promise<vscode.TreeItem> {
		let treeItem: vscode.TreeItem;
		
		if (element instanceof CollectionItem) {
			treeItem = await this.getCollectionWithSize(element);
		} else if (element instanceof DocumentItem) {
			treeItem = await this.getDocumentWithSize(element);
		} else if (
			element instanceof KeyItem ||
			element instanceof NestedKeyItem
		) {
			treeItem = element; // KeyItem and NestedKeyItem don't need additional processing
		} else {
			treeItem = element;
		}

		// Update contextValue and label based on pin status
		if (this.isItemPinned(element)) {
			// Add pin indicator to the label
			const originalLabel = treeItem.label?.toString() || "";
			treeItem.label = `📌 ${originalLabel}`;
			
			// Update contextValue to indicate pinned status
			const originalContextValue = treeItem.contextValue || "";
			treeItem.contextValue = `${originalContextValue}-pinned`;
		}

		return treeItem;
	}

	async getParent(element: Item): Promise<Item | undefined> {
		if (element instanceof DocumentItem) {
			return new CollectionItem(
				element.reference.parent.id,
				element.reference.parent
			);
		} else if (element instanceof CollectionItem) {
			if (element.reference.parent !== null) {
				return new DocumentItem(
					element.reference.parent.id,
					element.reference.parent
				);
			}
		}
	}

	async getChildren(
		element?: DocumentItem | CollectionItem | KeyItem | NestedKeyItem
	): Promise<Item[] | undefined> {
		const config = vscode.workspace.getConfiguration("firestore-explorer");
		const viewMode = config.get("viewMode") as string;

		const firestore = await initializeFirestore();
		if (!element) {
			const refs = await firestore.listCollections();

			const items = refs.map(
				(ref) =>
					new CollectionItem(ref.id, ref, {
						fieldName: this._orderBy[ref.path]?.field ?? "id",
						direction: this._orderBy[ref.path]?.direction ?? "asc",
					})
			);

			// Sort items: pinned items first, then alphabetically
			return this.sortWithPinnedFirst(items);
		} else if (element instanceof DocumentItem) {
			const refs = await element.reference.listCollections();

			const items = refs.map(
				(ref) =>
					new CollectionItem(ref.id, ref, {
						fieldName: this._orderBy[ref.path]?.field ?? "id",
						direction: this._orderBy[ref.path]?.direction ?? "asc",
					})
			);

			// Sort items: pinned items first, then alphabetically
			return this.sortWithPinnedFirst(items);
		} else if (element instanceof KeyItem) {
			// Get nested keys for a specific key in the collection
			return this.getNestedKeys(element);
		} else if (element instanceof NestedKeyItem) {
			// Get further nested keys for a nested property
			return this.getNestedKeys(element);
		} else if (element instanceof CollectionItem) {
			// Check view mode to determine what to show
			if (viewMode === "detailed") {
				return this.getCollectionKeys(element);
			} else {
				return this.getCollectionDocuments(element);
			}
		}
	}

	/**
	 * Gets documents in a collection (original Firebase structure mode behavior)
	 */
	private async getCollectionDocuments(
		element: CollectionItem
	): Promise<Item[]> {
		const limit =
			this._paging[element.reference.path] ??
			vscode.workspace
				.getConfiguration()
				.get("firestore-explorer.pagingLimit");

		console.log(
			this._orderBy[element.reference.path]?.field ??
				admin.firestore.FieldPath.documentId()
		);
		const snapshots = await element.reference
			.limit(limit + 1)
			.orderBy(
				this._orderBy[element.reference.path]?.field ??
					admin.firestore.FieldPath.documentId(),
				this._orderBy[element.reference.path]?.direction ?? "asc"
			)
			.get();

		const items: DocumentItem[] = [];

		snapshots.forEach((snapshot) => {
			const sampleData = this.getSampleData(snapshot.data());
			items.push(
				new DocumentItem(
					snapshot.id,
					snapshot.ref,
					undefined,
					sampleData
				)
			);
		});

		if (items.length > limit) {
			const documents = items.slice(0, -1); // Remove the extra item
			const sortedDocuments = this.sortWithPinnedFirst(documents);
			return [...sortedDocuments, new ShowMoreItemsItem(element.reference, limit)];
		} else {
			return this.sortWithPinnedFirst(items);
		}
	}

	/**
	 * Gets all unique keys found in documents within a collection (detailed mode)
	 */
	private async getCollectionKeys(
		element: CollectionItem
	): Promise<KeyItem[]> {
		try {
			// Get a sample of documents to analyze their keys
			const limit = Math.min(
				100,
				vscode.workspace
					.getConfiguration()
					.get("firestore-explorer.pagingLimit", 10) * 5
			); // Sample more docs for key analysis

			const snapshots = await element.reference.limit(limit).get();

			// Map to store key information: key name -> { values: [], count: number }
			const keyData = new Map<
				string,
				{ values: Set<any>; count: number }
			>();

			snapshots.forEach((snapshot) => {
				const data = snapshot.data();
				if (data) {
					Object.keys(data).forEach((key) => {
						if (!keyData.has(key)) {
							keyData.set(key, { values: new Set(), count: 0 });
						}
						const keyInfo = keyData.get(key)!;
						keyInfo.count++;

						// Add simplified value for display
						const simplifiedValue = this.simplifyValue(
							data[key],
							30
						);
						keyInfo.values.add(JSON.stringify(simplifiedValue));
					});
				}
			});

			// Convert to KeyItem array
			const keyItems: KeyItem[] = [];
			keyData.forEach((info, keyName) => {
				const sampleValues = Array.from(info.values)
					.slice(0, 10)
					.map((v) => {
						try {
							return JSON.parse(v);
						} catch {
							return v;
						}
					});

				// Check if this key contains object values that can be expanded
				const hasNestedObjects =
					this.hasExpandableObjects(sampleValues);

				keyItems.push(
					new KeyItem(
						keyName,
						element.reference.path,
						sampleValues,
						info.count,
						hasNestedObjects
					)
				);
			});

			// Sort keys: pinned first, then alphabetically
			return this.sortWithPinnedFirst(keyItems);
		} catch (error) {
			console.error("Failed to get collection keys:", error);
			return [];
		}
	}

	/**
	 * Gets nested keys/properties for a KeyItem or NestedKeyItem that contains object values
	 */
	private async getNestedKeys(
		element: KeyItem | NestedKeyItem
	): Promise<NestedKeyItem[]> {
		try {
			let collectionPath: string;
			let keyPath: string;

			if (element instanceof KeyItem) {
				collectionPath = element.collectionPath;
				keyPath = element.keyName;
			} else {
				collectionPath = element.collectionPath;
				keyPath = element.reference.replace(
					`${element.collectionPath}/`,
					""
				);
			}

			const firestore = await initializeFirestore();
			const collectionRef = firestore.collection(collectionPath);

			// Get a sample of documents to analyze nested keys
			const limit = Math.min(
				50,
				vscode.workspace
					.getConfiguration()
					.get("firestore-explorer.pagingLimit", 10) * 3
			);

			const snapshots = await collectionRef.limit(limit).get();

			// Map to store nested key information
			const nestedKeyData = new Map<
				string,
				{ values: Set<any>; count: number }
			>();

			snapshots.forEach((snapshot) => {
				const data = snapshot.data();
				if (data) {
					// Navigate to the nested object using the key path
					const value = this.getValueAtPath(data, keyPath);
					if (
						value &&
						typeof value === "object" &&
						!Array.isArray(value) &&
						value !== null
					) {
						Object.keys(value).forEach((nestedKey) => {
							if (!nestedKeyData.has(nestedKey)) {
								nestedKeyData.set(nestedKey, {
									values: new Set(),
									count: 0,
								});
							}
							const keyInfo = nestedKeyData.get(nestedKey)!;
							keyInfo.count++;

							// Add simplified value for display
							const simplifiedValue = this.simplifyValue(
								value[nestedKey],
								20
							);
							keyInfo.values.add(JSON.stringify(simplifiedValue));
						});
					}
				}
			});

			// Convert to NestedKeyItem array
			const nestedKeyItems: NestedKeyItem[] = [];
			nestedKeyData.forEach((info, nestedKeyName) => {
				const sampleValues = Array.from(info.values)
					.slice(0, 8)
					.map((v) => {
						try {
							return JSON.parse(v);
						} catch {
							return v;
						}
					});

				// Check if this nested key contains further nested objects
				const hasNestedObjects =
					this.hasExpandableObjects(sampleValues);

				nestedKeyItems.push(
					new NestedKeyItem(
						nestedKeyName,
						element instanceof KeyItem
							? `${element.collectionPath}/${element.keyName}`
							: element.reference,
						collectionPath,
						sampleValues,
						info.count,
						hasNestedObjects
					)
				);
			});

			// Sort nested keys: pinned first, then alphabetically
			return this.sortWithPinnedFirst(nestedKeyItems);
		} catch (error) {
			console.error("Failed to get nested keys:", error);
			return [];
		}
	}

	/**
	 * Checks if the sample values contain objects that can be expanded further
	 */
	private hasExpandableObjects(sampleValues: any[]): boolean {
		return sampleValues.some(
			(value) =>
				value &&
				typeof value === "object" &&
				!Array.isArray(value) &&
				value !== null &&
				!this.isFirestoreSpecialType(value) &&
				Object.keys(value).length > 0
		);
	}

	/**
	 * Checks if a value is a Firestore special type (timestamp, reference, geopoint, etc.)
	 */
	private isFirestoreSpecialType(value: any): boolean {
		if (!value || typeof value !== "object") {
			return false;
		}

		// Check for simplified Firestore types
		return (
			value._timestamp !== undefined ||
			value._reference !== undefined ||
			value._geopoint !== undefined
		);
	}

	/**
	 * Gets a value from an object using a dot-notation path
	 */
	private getValueAtPath(obj: any, path: string): any {
		const keys = path.split(".");
		let current = obj;

		for (const key of keys) {
			if (current && typeof current === "object" && key in current) {
				current = current[key];
			} else {
				return undefined;
			}
		}

		return current;
	}

	/**
	 * Retrieves children for the given collection and returns the same collection with the isEmpty flag set.
	 * @param  {admin.firestore.CollectionReference} ref
	 * @returns Promise
	 */
	async getCollectionWithSize(
		element: CollectionItem
	): Promise<CollectionItem> {
		try {
			// Get a sample of documents to check if collection is empty and get approximate count
			const docs = await element.reference.limit(1).get();

			// For better tooltip info, try to get an approximate document count (limited to avoid expensive queries)
			let documentCount: number | undefined;
			if (!docs.empty) {
				const countSnapshot = await element.reference.limit(100).get();
				documentCount = countSnapshot.size;
				// If we hit the limit, indicate it's "100+"
				if (countSnapshot.size === 100) {
					documentCount = undefined; // Don't show exact count if it might be much higher
				}
			} else {
				documentCount = 0;
			}

			let updatedElement = element.withSize(docs.size);
			if (documentCount !== undefined) {
				updatedElement =
					updatedElement.withDocumentCount(documentCount);
			}
			return updatedElement;
		} catch (error) {
			console.error("Failed to get collection size:", error);
			return element.withSize(0);
		}
	}

	/**
	 * Retrieves children for the given document and returns the same document with the isEmpty flag set.
	 * @param  {admin.firestore.DocumentReference} ref
	 * @returns Promise
	 */
	async getDocumentWithSize(element: DocumentItem): Promise<DocumentItem> {
		const collections = await element.reference.listCollections();

		// If we don't have sample data yet, fetch it
		if (!element.sampleData) {
			try {
				const docSnapshot = await element.reference.get();
				if (docSnapshot.exists) {
					const sampleData = this.getSampleData(docSnapshot.data());
					return element
						.withSize(collections.length)
						.withSampleData(sampleData);
				}
			} catch (error) {
				console.error(
					"Failed to fetch document data for tooltip:",
					error
				);
			}
		}

		return element.withSize(collections.length);
	}

	/**
	 * Extracts a sample of document data for tooltip display, limiting the size
	 * and handling Firestore-specific data types.
	 * @param data - The document data from Firestore
	 * @returns Simplified object suitable for JSON display in tooltip
	 */
	private getSampleData(data: any): any {
		if (!data) {
			return null;
		}

		const sample: any = {};
		const maxFields = 5; // Limit number of fields shown in tooltip
		const maxStringLength = 50; // Limit string length in tooltip

		let fieldCount = 0;
		for (const [key, value] of Object.entries(data)) {
			if (fieldCount >= maxFields) {
				sample["..."] = `${
					Object.keys(data).length - maxFields
				} more fields`;
				break;
			}

			sample[key] = this.simplifyValue(value, maxStringLength);
			fieldCount++;
		}

		return sample;
	}

	/**
	 * Simplifies a Firestore value for display in tooltip, handling special types
	 * and truncating long strings.
	 */
	private simplifyValue(value: any, maxLength: number): any {
		if (value === null || value === undefined) {
			return value;
		}

		// Handle Firestore Timestamp
		if (value && typeof value.toDate === "function") {
			return { _timestamp: value.toDate().toISOString() };
		}

		// Handle Firestore GeoPoint
		if (
			value &&
			typeof value.latitude === "number" &&
			typeof value.longitude === "number"
		) {
			return { _geopoint: { lat: value.latitude, lng: value.longitude } };
		}

		// Handle Firestore DocumentReference
		if (
			value &&
			typeof value.path === "string" &&
			value.path.includes("/")
		) {
			return { _reference: value.path };
		}

		// Handle arrays (limit to first few items)
		if (Array.isArray(value)) {
			const maxItems = 3;
			if (value.length > maxItems) {
				return [
					...value
						.slice(0, maxItems)
						.map((v) => this.simplifyValue(v, maxLength)),
					`...${value.length - maxItems} more`,
				];
			}
			return value.map((v) => this.simplifyValue(v, maxLength));
		}

		// Handle objects (recursively simplify)
		if (typeof value === "object") {
			const simplified: any = {};
			const keys = Object.keys(value);
			const maxKeys = 3;

			for (let i = 0; i < Math.min(keys.length, maxKeys); i++) {
				const key = keys[i];
				simplified[key] = this.simplifyValue(value[key], maxLength);
			}

			if (keys.length > maxKeys) {
				simplified["..."] = `${keys.length - maxKeys} more properties`;
			}

			return simplified;
		}

		// Handle strings (truncate if too long)
		if (typeof value === "string" && value.length > maxLength) {
			return value.substring(0, maxLength) + "...";
		}

		// Return primitive values as-is
		return value;
	}

	/**
	 * Increase the paging limit for the given collection path a refresh the view to show more items.
	 * @param  {string} path
	 */
	async showMoreItems(path: string) {
		const defaultLimit = vscode.workspace
			.getConfiguration()
			.get("firestore-explorer.pagingLimit") as number;
		const newLimit = (this._paging[path] ?? defaultLimit) + defaultLimit;
		this._paging[path] = newLimit;
		this.refresh();
	}

	async orderBy(
		path: string,
		field: string | undefined,
		direction: admin.firestore.OrderByDirection
	) {
		this._orderBy[path] = {
			field,
			direction,
		};
		this.refresh();
	}

	/**
	 * Sort items with pinned items first, then alphabetically
	 */
	private sortWithPinnedFirst<T extends Item>(items: T[]): T[] {
		return items.sort((a, b) => {
			const aPath = this.getItemPath(a);
			const bPath = this.getItemPath(b);
			const aPinned = this._pinnedItems.has(aPath);
			const bPinned = this._pinnedItems.has(bPath);

			// If one is pinned and the other isn't, pinned goes first
			if (aPinned && !bPinned) {
				return -1;
			}
			if (!aPinned && bPinned) {
				return 1;
			}

			// If both are pinned or both are not pinned, sort alphabetically
			return a.label!.toString().localeCompare(b.label!.toString());
		});
	}

	/**
	 * Get the path identifier for an item (used for pinning)
	 */
	private getItemPath(item: Item): string {
		if (item instanceof CollectionItem || item instanceof DocumentItem) {
			return item.reference.path;
		} else if (item instanceof KeyItem) {
			return item.reference;
		} else if (item instanceof NestedKeyItem) {
			return item.reference;
		}
		return item.id || item.label?.toString() || "";
	}

	/**
	 * Pin an item to the top of the tree view
	 */
	async pinItem(item: Item): Promise<void> {
		const path = this.getItemPath(item);
		this._pinnedItems.add(path);
		await this.savePinnedItems();
		this.refresh();
	}

	/**
	 * Unpin an item from the top of the tree view
	 */
	async unpinItem(item: Item): Promise<void> {
		const path = this.getItemPath(item);
		this._pinnedItems.delete(path);
		await this.savePinnedItems();
		this.refresh();
	}

	/**
	 * Check if an item is pinned
	 */
	isItemPinned(item: Item): boolean {
		const path = this.getItemPath(item);
		return this._pinnedItems.has(path);
	}
}
