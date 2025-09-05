import * as vscode from "vscode";
import {
	Item,
	KeyItem,
	NestedKeyItem,
	CollectionItem,
	DocumentItem,
} from "../explorer/items";
import initializeFirestore from "../utilities/initializeFirestore";

/**
 * Copy JSON content to clipboard based on current view mode:
 * - Structure/Firebase mode: Copy JSON of the selected node (document content or collection summary)
 * - Detailed key mode: Copy summary of collections showing all available keys
 * @param  {Item} item
 */
export default async function copyJson(item: Item) {
	const config = vscode.workspace.getConfiguration("firestore-explorer");
	const viewMode = config.get("viewMode") as string;

	let jsonToCopy: string;

	try {
		if (viewMode === "detailed") {
			// Detailed mode: Copy collection summary with all keys
			jsonToCopy = await generateCollectionSummary(item);
		} else {
			// Structure/Firebase mode: Copy JSON of the node
			jsonToCopy = await generateNodeJson(item);
		}

		await vscode.env.clipboard.writeText(jsonToCopy);
		vscode.window.showInformationMessage(
			`JSON copied to clipboard (${jsonToCopy.length} characters)`
		);
	} catch (error) {
		vscode.window.showErrorMessage(
			`Failed to copy JSON: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

/**
 * Generates JSON content for a specific node in structure/firebase mode
 */
async function generateNodeJson(item: Item): Promise<string> {
	const firestore = await initializeFirestore();

	if (item instanceof DocumentItem) {
		// For documents, get the full document data
		const docSnap = await item.reference.get();
		if (!docSnap.exists) {
			return JSON.stringify({ error: "Document does not exist" }, null, 2);
		}

		const data = docSnap.data();
		return JSON.stringify(simplifyFirestoreData(data), null, 2);
	} else if (item instanceof CollectionItem) {
		// For collections, get a summary with sample documents
		const snapshot = await item.reference.limit(5).get();
		const documents: any[] = [];

		snapshot.forEach((doc) => {
			documents.push({
				id: doc.id,
				data: simplifyFirestoreData(doc.data()),
			});
		});

		const collectionSummary = {
			collection: item.reference.path,
			totalDocuments: snapshot.size,
			sampleDocuments: documents,
			note: snapshot.size >= 5 ? "Showing first 5 documents" : "All documents shown",
		};

		return JSON.stringify(collectionSummary, null, 2);
	} else {
		// For key items or other types, return basic info
		return JSON.stringify(
			{
				type: item.constructor.name,
				reference: item.reference,
				label: item.label,
			},
			null,
			2
		);
	}
}

/**
 * Generates collection summary with all available keys in detailed mode
 */
async function generateCollectionSummary(item: Item): Promise<string> {
	const firestore = await initializeFirestore();
	let collectionRef: any;

	// Determine the collection reference based on item type
	if (item instanceof CollectionItem) {
		collectionRef = item.reference;
	} else if (item instanceof DocumentItem) {
		// If it's a document, get its parent collection
		collectionRef = item.reference.parent;
	} else if (item instanceof KeyItem) {
		// For key items, get the collection from the stored path
		collectionRef = firestore.collection(item.collectionPath);
	} else if (item instanceof NestedKeyItem) {
		// For nested key items, get the collection from the stored path
		collectionRef = firestore.collection(item.collectionPath);
	} else {
		throw new Error("Cannot generate collection summary for this item type");
	}

	// Get all documents in the collection (limited to prevent memory issues)
	const snapshot = await collectionRef.limit(100).get();
	const keysSummary: { [key: string]: any } = {};

	snapshot.forEach((doc: any) => {
		const data = doc.data();
		if (data) {
			analyzeKeys(data, keysSummary);
		}
	});

	const summary = {
		collection: collectionRef.path,
		totalDocuments: snapshot.size,
		analyzedDocuments: Math.min(snapshot.size, 100),
		keys: Object.keys(keysSummary).sort().map((key) => ({
			name: key,
			type: Array.from(keysSummary[key].types).join(" | "),
			frequency: keysSummary[key].count,
			percentage: Math.round((keysSummary[key].count / snapshot.size) * 100),
			sampleValues: keysSummary[key].samples.slice(0, 3),
		})),
		note: snapshot.size > 100 ? "Analysis based on first 100 documents" : "All documents analyzed",
	};

	return JSON.stringify(summary, null, 2);
}

/**
 * Recursively analyze keys in a document and build a summary
 */
function analyzeKeys(obj: any, summary: { [key: string]: any }, prefix = ""): void {
	for (const [key, value] of Object.entries(obj)) {
		const fullKey = prefix ? `${prefix}.${key}` : key;

		if (!summary[fullKey]) {
			summary[fullKey] = {
				types: new Set<string>(),
				count: 0,
				samples: [],
			};
		}

		summary[fullKey].count++;
		
		// Determine type
		let type: string = typeof value;
		if (value === null) {
			type = "null";
		} else if (Array.isArray(value)) {
			type = "array";
		} else if (value && typeof value === "object") {
			// Check for Firestore special types
			if ((value as any)._seconds !== undefined) {
				type = "timestamp";
			} else if ((value as any)._latitude !== undefined && (value as any)._longitude !== undefined) {
				type = "geopoint";
			} else if ((value as any)._path !== undefined) {
				type = "reference";
			} else {
				type = "object";
				// Recursively analyze nested objects
				analyzeKeys(value, summary, fullKey);
			}
		}

		summary[fullKey].types.add(type);

		// Store sample values (avoid duplicates)
		if (summary[fullKey].samples.length < 5) {
			const sampleValue = simplifyFirestoreData(value);
			const stringified = JSON.stringify(sampleValue);
			if (!summary[fullKey].samples.some((s: any) => JSON.stringify(s) === stringified)) {
				summary[fullKey].samples.push(sampleValue);
			}
		}
	}
}

/**
 * Simplify Firestore data types for JSON serialization
 */
function simplifyFirestoreData(data: any): any {
	if (data === null || data === undefined) {
		return data;
	}

	if (Array.isArray(data)) {
		return data.map(simplifyFirestoreData);
	}

	if (typeof data === "object") {
		// Handle Firestore Timestamp
		if ((data as any)._seconds !== undefined) {
			return {
				_timestamp: new Date((data as any)._seconds * 1000).toISOString(),
			};
		}

		// Handle Firestore GeoPoint
		if ((data as any)._latitude !== undefined && (data as any)._longitude !== undefined) {
			return {
				_geopoint: {
					lat: (data as any)._latitude,
					lng: (data as any)._longitude,
				},
			};
		}

		// Handle Firestore DocumentReference
		if ((data as any)._path !== undefined) {
			return {
				_reference: (data as any)._path,
			};
		}

		// Regular object - recursively simplify
		const simplified: any = {};
		for (const [key, value] of Object.entries(data)) {
			simplified[key] = simplifyFirestoreData(value);
		}
		return simplified;
	}

	return data;
}
