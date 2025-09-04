import * as admin from "firebase-admin";
import * as vscode from "vscode";

export abstract class Item extends vscode.TreeItem {
	abstract reference:
		| admin.firestore.DocumentReference
		| admin.firestore.CollectionReference;
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
		this.iconPath = new vscode.ThemeIcon("folder");
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
		super(`Load ${pagingLimit} more`, vscode.TreeItemCollapsibleState.None);
		this.reference = reference;
		this.id = reference.path + "///showMore";
		this.offset = offset;
		this.iconPath = new vscode.ThemeIcon("more");
		this.command = {
			command: "firestore-explorer.showMoreItems",
			title: "More Items",
			arguments: [reference.path],
		};
	}

	// TODO: Show progress animation when loading more items
}
