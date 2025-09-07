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

export default async function openWithPromptGenerate(
	documentReference: admin.firestore.DocumentReference
) {
	// Get the Firestore path for the item
	const path = documentReference.path;

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

	const doc = await vscode.workspace.openTextDocument({
		content:
			`# Firestore Path: ${path}\n\n` +
			`## Field Summary\n\n${fieldTable}\n` +
			`## Sample JSON Structure\n\n\`\`\`json\n${jsonDetail}\n\`\`\`\n`,
		language: "markdown",
	});
	await vscode.window.showTextDocument(doc, {
		preview: false,
		preserveFocus: true,
	});
}
