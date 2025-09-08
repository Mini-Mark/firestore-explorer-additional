import * as vscode from "vscode";
import * as admin from "firebase-admin";

function getType(val: any): string {
	if (val === null) {
		return "null";
	}
	if (Array.isArray(val)) {
		return "array";
	}
	return typeof val;
}

function generateFieldTable(json: any, prefix: string = ""): string {
	if (!json || typeof json !== "object") {
		return "(no fields)";
	}
	let rows = "";
	if (prefix === "") {
		rows =
			"| Field | Type | Sample Value |\n|-------|------|--------------|\n";
	}

	for (const key of Object.keys(json)) {
		const value = json[key];
		let type = getType(value);
		let fieldName = prefix ? `${prefix}.${key}` : key;
		let sample = "";

		if (Array.isArray(value)) {
			sample = `[${value.length} items]`;
			// Show array element structure if first element is object
			if (
				value.length > 0 &&
				typeof value[0] === "object" &&
				value[0] !== null
			) {
				sample += ` of objects`;
			}
		} else if (typeof value === "object" && value !== null) {
			const subFields = Object.keys(value);
			sample = `{${subFields.length} fields: ${subFields
				.slice(0, 3)
				.join(", ")}${subFields.length > 3 ? "..." : ""}}`;
		} else {
			sample = JSON.stringify(value);
			if (sample && sample.length > 40) {
				sample = sample.slice(0, 37) + "...";
			}
		}

		rows += `| \`${fieldName}\` | \`${type}\` | ${sample} |\n`;

		// Recursively add nested object fields
		if (
			typeof value === "object" &&
			value !== null &&
			!Array.isArray(value)
		) {
			rows += generateFieldTable(value, fieldName);
		}

		// Show structure of array elements if they are objects
		if (
			Array.isArray(value) &&
			value.length > 0 &&
			typeof value[0] === "object" &&
			value[0] !== null
		) {
			rows += generateFieldTable(value[0], `${fieldName}[0]`);
		}
	}
	return rows;
}

function formatPathWithLabels(path: string): string {
	const segments = path.split("/");
	const formattedSegments: string[] = [];

	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i];

		if (i % 2 === 0) {
			// Even index = collection name
			formattedSegments.push(segment);
		} else {
			// Odd index = document ID (potentially a UID)
			// Check if it looks like a UID (alphanumeric, 20+ chars, or specific patterns)
			const isUID =
				/^[a-zA-Z0-9_-]{15,}$/.test(segment) ||
				/^[a-zA-Z0-9]{20,}$/.test(segment) ||
				segment.length > 25;

			if (isUID) {
				formattedSegments.push(`{uid}`);
			} else {
				formattedSegments.push(segment);
			}
		}
	}

	return formattedSegments.join("/");
}

export default async function openWithPromptGenerate(
	documentReference: admin.firestore.DocumentReference
) {
	// Get the Firestore path for the item
	const path = documentReference.path;
	const formattedPath = formatPathWithLabels(path);

	// Try to get JSON structure/sample data
	let jsonDetail = "(no data available)";
	let fieldTable = "(no fields)";
	let parsed: any = undefined;
	try {
		const snap = await documentReference.get();
		if (snap.exists) {
			parsed = snap.data();
			jsonDetail = JSON.stringify(parsed, null, 2);
			fieldTable = generateFieldTable(parsed);
		}
	} catch {}

	// Create a safe filename from the path
	const safePath = path.replace(/[\/\\:*?"<>|]/g, "_");
	const fileName = `firestore_${safePath}.md`;

	const content =
		`# Firestore Document\n\n` +
		`**Raw Path:** \`${path}\`\n\n` +
		`**Structured Path:** \`${formattedPath}\`\n\n` +
		`## Field Summary\n\n${fieldTable}\n` +
		`## Sample JSON Structure\n\n\`\`\`json\n${jsonDetail}\n\`\`\`\n`;

	// Create a URI for the preview file
	const uri = vscode.Uri.parse(`untitled:${fileName}`);

	const doc = await vscode.workspace.openTextDocument(uri);
	const edit = new vscode.WorkspaceEdit();
	edit.insert(uri, new vscode.Position(0, 0), content);
	await vscode.workspace.applyEdit(edit);

	await vscode.window.showTextDocument(doc, {
		preview: true,
		preserveFocus: false,
	});

	// Set the language to markdown
	await vscode.languages.setTextDocumentLanguage(doc, "markdown");
}
