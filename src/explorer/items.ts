import * as admin from "firebase-admin";
import * as vscode from "vscode";

export abstract class Item extends vscode.TreeItem {
	abstract reference:
		| admin.firestore.DocumentReference
		| admin.firestore.CollectionReference
		| string; // For KeyItem which doesn't have a Firestore reference
}

/**
 * A Tree View item representing a key/field found in documents within a collection.
 * Used in detailed view mode to show all available keys.
 */
export class KeyItem extends Item {
	reference: string; // Store the collection path and key name

	constructor(
		public keyName: string,
		public collectionPath: string,
		public sampleValues: any[] = [],
		public documentCount: number = 0,
		public hasNestedObjects: boolean = false
	) {
		super(keyName, vscode.TreeItemCollapsibleState.None);

		this.reference = `${collectionPath}/${keyName}`;
		this.id = this.reference;
		this.contextValue = "key";
		this.tooltip = this.createTooltip();
		this.iconPath = new vscode.ThemeIcon(
			hasNestedObjects ? "symbol-object" : "key"
		);

		// Set collapsible state based on whether this key has nested objects
		this.collapsibleState = hasNestedObjects
			? vscode.TreeItemCollapsibleState.Collapsed
			: vscode.TreeItemCollapsibleState.None;

		// Show sample values in description
		if (sampleValues.length > 0) {
			const sampleText = sampleValues
				.slice(0, 3)
				.map((v) => {
					if (typeof v === "string" && v.length > 20) {
						return `"${v.substring(0, 17)}..."`;
					}
					return JSON.stringify(v);
				})
				.join(", ");
			this.description = `(${documentCount} docs) ${sampleText}${
				sampleValues.length > 3 ? "..." : ""
			}`;
		} else {
			this.description = `(${documentCount} docs)`;
		}
	}

	private createTooltip(): vscode.MarkdownString {
		const tooltip = new vscode.MarkdownString();
		tooltip.isTrusted = true;
		tooltip.supportHtml = true;

		tooltip.appendMarkdown(`**Key:** \`${this.keyName}\`\n\n`);
		tooltip.appendMarkdown(
			`**Collection:** \`${this.collectionPath}\`\n\n`
		);
		tooltip.appendMarkdown(
			`**Found in:** ${this.documentCount} document(s)\n\n`
		);

		if (this.sampleValues.length > 0) {
			tooltip.appendMarkdown("**Sample Values:**\n");
			const displayValues = this.sampleValues.slice(0, 5);
			displayValues.forEach((value, index) => {
				tooltip.appendMarkdown(
					`${index + 1}. \`${JSON.stringify(value)}\`\n`
				);
			});

			if (this.sampleValues.length > 5) {
				tooltip.appendMarkdown(
					`\n...and ${this.sampleValues.length - 5} more values`
				);
			}
		}

		return tooltip;
	}
}

/**
 * A Tree View item representing a nested key/property within an object-type key.
 * Used for drilling down into object structures in detailed view mode.
 */
export class NestedKeyItem extends Item {
	reference: string; // Store the parent key path and nested key name

	constructor(
		public nestedKeyName: string,
		public parentKeyPath: string,
		public collectionPath: string,
		public sampleValues: any[] = [],
		public documentCount: number = 0,
		public hasNestedObjects: boolean = false
	) {
		super(nestedKeyName, vscode.TreeItemCollapsibleState.None);

		this.reference = `${parentKeyPath}.${nestedKeyName}`;
		this.id = this.reference;
		this.contextValue = "nested-key";
		this.tooltip = this.createTooltip();
		this.iconPath = new vscode.ThemeIcon(
			hasNestedObjects ? "symbol-object" : "symbol-property"
		);

		// Set collapsible state based on whether this nested key has further nested objects
		this.collapsibleState = hasNestedObjects
			? vscode.TreeItemCollapsibleState.Collapsed
			: vscode.TreeItemCollapsibleState.None;

		// Show sample values in description
		if (sampleValues.length > 0) {
			const sampleText = sampleValues
				.slice(0, 2)
				.map((v) => {
					if (typeof v === "string" && v.length > 15) {
						return `"${v.substring(0, 12)}..."`;
					}
					return JSON.stringify(v);
				})
				.join(", ");
			this.description = `(${documentCount} docs) ${sampleText}${
				sampleValues.length > 2 ? "..." : ""
			}`;
		} else {
			this.description = `(${documentCount} docs)`;
		}
	}

	private createTooltip(): vscode.MarkdownString {
		const tooltip = new vscode.MarkdownString();
		tooltip.isTrusted = true;
		tooltip.supportHtml = true;

		tooltip.appendMarkdown(`**Nested Key:** \`${this.nestedKeyName}\`\n\n`);
		tooltip.appendMarkdown(`**Parent Key:** \`${this.parentKeyPath}\`\n\n`);
		tooltip.appendMarkdown(
			`**Collection:** \`${this.collectionPath}\`\n\n`
		);
		tooltip.appendMarkdown(
			`**Found in:** ${this.documentCount} document(s)\n\n`
		);

		if (this.sampleValues.length > 0) {
			tooltip.appendMarkdown("**Sample Values:**\n");
			const displayValues = this.sampleValues.slice(0, 5);
			displayValues.forEach((value, index) => {
				tooltip.appendMarkdown(
					`${index + 1}. \`${JSON.stringify(value)}\`\n`
				);
			});

			if (this.sampleValues.length > 5) {
				tooltip.appendMarkdown(
					`\n...and ${this.sampleValues.length - 5} more values`
				);
			}
		}

		return tooltip;
	}
}

/**
 * A Tree View item representing a Firestore document.
 */
export class DocumentItem extends Item {
	constructor(
		public documentId: string,
		public reference: admin.firestore.DocumentReference,
		public size: number | undefined = undefined,
		public sampleData?: any
	) {
		super(documentId, vscode.TreeItemCollapsibleState.None);
		this.command = {
			command: "firestore-explorer.openPath",
			title: "Open",
			arguments: [reference.path],
		};

		this.id = reference.path;
		this.contextValue = "document";
		this.tooltip = this.createTooltip();
		this.iconPath = new vscode.ThemeIcon("file");
		this.collapsibleState =
			size === 0
				? vscode.TreeItemCollapsibleState.None
				: vscode.TreeItemCollapsibleState.Collapsed;
	}

	private createTooltip(): vscode.MarkdownString {
		const tooltip = new vscode.MarkdownString();
		tooltip.isTrusted = true;
		tooltip.supportHtml = true;

		tooltip.appendMarkdown(
			`**Document Path:** \`${this.reference.path}\`\n\n`
		);

		if (this.sampleData) {
			tooltip.appendMarkdown("**Sample Data:**\n");
			tooltip.appendCodeblock(
				JSON.stringify(this.sampleData, null, 2),
				"json"
			);
		} else {
			tooltip.appendMarkdown("*Hover to load sample data...*");
		}

		return tooltip;
	}

	withSize(size: number): DocumentItem {
		return new DocumentItem(
			this.documentId,
			this.reference,
			size,
			this.sampleData
		);
	}

	withSampleData(sampleData: any): DocumentItem {
		return new DocumentItem(
			this.documentId,
			this.reference,
			this.size,
			sampleData
		);
	}
}

/**
 * A Tree View item representing a Firestore collection.
 */
export class CollectionItem extends Item {
	constructor(
		public collectionId: string,
		public reference: admin.firestore.CollectionReference,
		public orderBy: {
			fieldName: string;
			direction: admin.firestore.OrderByDirection;
		} = { fieldName: "id", direction: "asc" },
		public size: number | undefined = undefined,
		public documentCount?: number
	) {
		super(collectionId, vscode.TreeItemCollapsibleState.Collapsed);

		this.id = reference.path;
		this.contextValue = "collection";
		this.tooltip = this.createTooltip();

		// Determine if this is a root collection (no parent path)
		// Root collections have paths with no forward slashes
		const isRootCollection = !reference.path.includes("/");

		console.log(
			`[DEBUG] Collection ${reference.path}, isRoot: ${isRootCollection}`
		);

		if (isRootCollection) {
			// Use a colored folder icon for root collections
			this.iconPath = new vscode.ThemeIcon(
				"folder",
				new vscode.ThemeColor("charts.blue")
			);
			console.log(
				`[DEBUG] Applied blue folder icon to root collection: ${reference.path}`
			);
		} else {
			// Use regular folder icon for nested collections
			this.iconPath = new vscode.ThemeIcon("folder");
			console.log(
				`[DEBUG] Applied regular folder icon to nested collection: ${reference.path}`
			);
		}

		this.collapsibleState =
			size === 0
				? vscode.TreeItemCollapsibleState.None
				: vscode.TreeItemCollapsibleState.Collapsed;
		this.description =
			(orderBy.direction === "asc" ? "↑" : "↓") + orderBy.fieldName;
	}

	private createTooltip(): vscode.MarkdownString {
		const tooltip = new vscode.MarkdownString();
		tooltip.isTrusted = true;
		tooltip.supportHtml = true;

		tooltip.appendMarkdown(
			`**Collection Path:** \`${this.reference.path}\`\n\n`
		);
		tooltip.appendMarkdown(
			`**Sort Order:** ${
				this.orderBy.direction === "asc" ? "Ascending" : "Descending"
			} by \`${this.orderBy.fieldName}\`\n\n`
		);

		if (this.documentCount !== undefined) {
			tooltip.appendMarkdown(
				`**Document Count:** ${this.documentCount} documents\n\n`
			);
		}

		tooltip.appendMarkdown("*Click to expand and view documents*");

		return tooltip;
	}

	withSize(size: number): CollectionItem {
		return new CollectionItem(
			this.collectionId,
			this.reference,
			this.orderBy,
			size,
			this.documentCount
		);
	}

	withDocumentCount(count: number): CollectionItem {
		return new CollectionItem(
			this.collectionId,
			this.reference,
			this.orderBy,
			this.size,
			count
		);
	}
}

/**
 * A Tree View item representing the "Show more" button
 */
export class ShowMoreItemsItem extends Item {
	reference: admin.firestore.CollectionReference;
	offset: number;

	constructor(
		reference: admin.firestore.CollectionReference,
		offset: number
	) {
		const pagingLimit = vscode.workspace
			.getConfiguration()
			.get("firestore-explorer.pagingLimit") as number;
		super(`Show All`, vscode.TreeItemCollapsibleState.None);
		this.reference = reference;
		this.id = reference.path + "///showMore";
		this.offset = offset;
		this.iconPath = new vscode.ThemeIcon("unfold");
		this.contextValue = "show-more";

		// Remove the command since we handle clicks via tree view selection events
		// this.command = {
		// 	command: "firestore-explorer.showMoreItems",
		// 	title: "Load More Items",
		// 	arguments: [reference.path],
		// };

		// Make sure the tree item is clickable and shows helpful tooltip
		this.tooltip = `Click to load all remaining documents from ${reference.path}`;

		console.log(
			`[DEBUG] ShowMoreItemsItem constructor called for path: ${reference.path}`
		);
		console.log(`[DEBUG] Context value:`, this.contextValue);
		console.log(`[DEBUG] Reference path:`, reference.path);
	}

	// TODO: Show progress animation when loading more items
}

/**
 * A Tree View item representing the "Show more" button for the pinned view
 */
export class PinnedShowMoreItemsItem extends Item {
	reference: admin.firestore.CollectionReference;
	offset: number;

	constructor(
		reference: admin.firestore.CollectionReference,
		offset: number
	) {
		const pagingLimit = vscode.workspace
			.getConfiguration()
			.get("firestore-explorer.pagingLimit") as number;
		super(`Load ${pagingLimit} more`, vscode.TreeItemCollapsibleState.None);
		this.reference = reference;
		this.id = reference.path + "///pinnedShowMore";
		this.offset = offset;
		this.iconPath = new vscode.ThemeIcon("more");
		this.contextValue = "pinned-show-more";
		this.command = {
			command: "firestore-pinned.showMoreItems",
			title: "More Items",
			arguments: [reference.path],
		};
	}
}
