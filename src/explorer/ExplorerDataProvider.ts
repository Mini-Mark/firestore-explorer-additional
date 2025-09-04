import * as admin from "firebase-admin";
import * as vscode from "vscode";

import initializeFirestore from "../utilities/initializeFirestore";
import { CollectionItem, DocumentItem, Item, ShowMoreItemsItem } from "./items";

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

	readonly onDidChangeTreeData: vscode.Event<Item | undefined> =
		this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	async getTreeItem(element: Item): Promise<vscode.TreeItem> {
		if (element instanceof CollectionItem) {
			return this.getCollectionWithSize(element);
		} else if (element instanceof DocumentItem) {
			return this.getDocumentWithSize(element);
		} else {
			return element;
		}
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
		element?: DocumentItem | CollectionItem
	): Promise<Item[] | undefined> {
		const firestore = await initializeFirestore();
		if (!element) {
			const refs = await firestore.listCollections();

			return refs.map(
				(ref) =>
					new CollectionItem(ref.id, ref, {
						fieldName: this._orderBy[ref.path]?.field ?? "id",
						direction: this._orderBy[ref.path]?.direction ?? "asc",
					})
			);
		} else if (element instanceof DocumentItem) {
			const refs = await element.reference.listCollections();

			return refs.map(
				(ref) =>
					new CollectionItem(ref.id, ref, {
						fieldName: this._orderBy[ref.path]?.field ?? "id",
						direction: this._orderBy[ref.path]?.direction ?? "asc",
					})
			);
		} else if (element instanceof CollectionItem) {
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
				items.pop();
				return [
					...items,
					new ShowMoreItemsItem(element.reference, limit),
				];
			} else {
				return items;
			}
		}
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
}
