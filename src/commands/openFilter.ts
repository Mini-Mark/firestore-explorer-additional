import * as vscode from "vscode";
import * as admin from "firebase-admin";
import { CollectionItem } from "../explorer/items";
import initializeFirestore from "../utilities/initializeFirestore";

export default async function openFilter(item: CollectionItem) {
	if (!item || !item.reference) {
		vscode.window.showErrorMessage(
			"Invalid collection selected for filtering"
		);
		return;
	}

	console.log(
		`[DEBUG] Opening filter for collection: ${item.reference.path}`
	);

	// Create and show webview panel
	const panel = vscode.window.createWebviewPanel(
		"firestoreFilter",
		`Filter: ${item.collectionId}`,
		vscode.ViewColumn.One,
		{
			enableScripts: true,
			retainContextWhenHidden: true,
		}
	);

	// Set the webview content
	panel.webview.html = getFilterWebviewContent(
		item.collectionId,
		item.reference.path
	);

	// Handle messages from the webview
	panel.webview.onDidReceiveMessage(async (message) => {
		switch (message.command) {
			case "search":
				const searchQuery = message.query;
				console.log(`[DEBUG] Filter search query: ${searchQuery}`);

				try {
					const results = await performSearch(
						item.reference,
						searchQuery
					);
					panel.webview.postMessage({
						command: "searchResults",
						results: results,
					});
				} catch (error) {
					console.error("Filter search error:", error);
					panel.webview.postMessage({
						command: "searchError",
						error:
							error instanceof Error
								? error.message
								: "Unknown error",
					});
				}
				break;

			case "openDocument":
				const documentPath = message.path;
				console.log(
					`[DEBUG] Opening document from filter: ${documentPath}`
				);

				// Use the existing openPath command
				vscode.commands.executeCommand(
					"firestore-explorer.openPath",
					documentPath
				);
				break;
		}
	}, undefined);
}

async function performSearch(
	collectionRef: admin.firestore.CollectionReference,
	searchQuery: string
): Promise<any[]> {
	const firestore = await initializeFirestore();

	try {
		// Get all documents in the collection
		const snapshot = await collectionRef.get();
		const results: any[] = [];

		snapshot.forEach((doc) => {
			const data = doc.data();
			const documentContent = JSON.stringify(data).toLowerCase();
			const query = searchQuery.toLowerCase();

			// Simple text search within document data
			if (documentContent.includes(query)) {
				results.push({
					id: doc.id,
					path: doc.ref.path,
					data: data,
					// Create a preview of matching content
					preview: createPreview(data, searchQuery),
				});
			}
		});

		console.log(`[DEBUG] Filter search found ${results.length} results`);
		return results;
	} catch (error) {
		console.error("Error performing search:", error);
		throw error;
	}
}

function createPreview(
	data: any,
	searchQuery: string
): { field: string; value: any }[] {
	const preview: { field: string; value: any }[] = [];
	const query = searchQuery.toLowerCase();

	function searchInObject(obj: any, path: string = "") {
		for (const [key, value] of Object.entries(obj)) {
			const currentPath = path ? `${path}.${key}` : key;

			if (
				typeof value === "string" &&
				value.toLowerCase().includes(query)
			) {
				preview.push({ field: currentPath, value: value });
			} else if (
				typeof value === "number" &&
				value.toString().includes(query)
			) {
				preview.push({ field: currentPath, value: value });
			} else if (
				typeof value === "object" &&
				value !== null &&
				!Array.isArray(value)
			) {
				searchInObject(value, currentPath);
			} else if (Array.isArray(value)) {
				value.forEach((item, index) => {
					if (
						typeof item === "string" &&
						item.toLowerCase().includes(query)
					) {
						preview.push({
							field: `${currentPath}[${index}]`,
							value: item,
						});
					} else if (typeof item === "object" && item !== null) {
						searchInObject(item, `${currentPath}[${index}]`);
					}
				});
			}
		}
	}

	searchInObject(data);
	return preview.slice(0, 5); // Limit to 5 preview items
}

function getFilterWebviewContent(
	collectionId: string,
	collectionPath: string
): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Filter Collection: ${collectionId}</title>
	<style>
		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
			padding: 20px;
			margin: 0;
		}
		
		.header {
			margin-bottom: 20px;
			padding-bottom: 10px;
			border-bottom: 1px solid var(--vscode-panel-border);
		}
		
		.search-container {
			margin-bottom: 20px;
		}
		
		.search-input {
			width: 100%;
			padding: 8px 12px;
			background-color: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border);
			border-radius: 3px;
			font-size: 14px;
		}
		
		.search-button {
			margin-top: 10px;
			padding: 8px 16px;
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			border-radius: 3px;
			cursor: pointer;
		}
		
		.search-button:hover {
			background-color: var(--vscode-button-hoverBackground);
		}
		
		.results-container {
			margin-top: 20px;
		}
		
		.result-item {
			border: 1px solid var(--vscode-panel-border);
			border-radius: 3px;
			margin-bottom: 10px;
			padding: 12px;
			background-color: var(--vscode-list-hoverBackground);
			cursor: pointer;
		}
		
		.result-item:hover {
			background-color: var(--vscode-list-activeSelectionBackground);
		}
		
		.result-id {
			font-weight: bold;
			margin-bottom: 8px;
			color: var(--vscode-textLink-foreground);
		}
		
		.result-preview {
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
		}
		
		.preview-item {
			margin: 4px 0;
		}
		
		.preview-field {
			font-weight: bold;
		}
		
		.loading {
			text-align: center;
			color: var(--vscode-descriptionForeground);
			padding: 20px;
		}
		
		.error {
			color: var(--vscode-errorForeground);
			background-color: var(--vscode-inputValidation-errorBackground);
			border: 1px solid var(--vscode-inputValidation-errorBorder);
			padding: 10px;
			border-radius: 3px;
		}
		
		.no-results {
			text-align: center;
			color: var(--vscode-descriptionForeground);
			padding: 20px;
		}
	</style>
</head>
<body>
	<div class="header">
		<h2>Filter Collection: ${collectionId}</h2>
		<p>Path: <code>${collectionPath}</code></p>
	</div>
	
	<div class="search-container">
		<input type="text" id="searchInput" class="search-input" placeholder="Enter search term to filter documents..." />
		<button id="searchButton" class="search-button">Search</button>
	</div>
	
	<div id="resultsContainer" class="results-container"></div>

	<script>
		const vscode = acquireVsCodeApi();
		const searchInput = document.getElementById('searchInput');
		const searchButton = document.getElementById('searchButton');
		const resultsContainer = document.getElementById('resultsContainer');

		searchButton.addEventListener('click', performSearch);
		searchInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				performSearch();
			}
		});

		function performSearch() {
			const query = searchInput.value.trim();
			if (!query) {
				return;
			}

			showLoading();
			vscode.postMessage({
				command: 'search',
				query: query
			});
		}

		function showLoading() {
			resultsContainer.innerHTML = '<div class="loading">Searching documents...</div>';
		}

		function showError(error) {
			resultsContainer.innerHTML = '<div class="error">Error: ' + error + '</div>';
		}

		function showResults(results) {
			if (results.length === 0) {
				resultsContainer.innerHTML = '<div class="no-results">No documents found matching your search.</div>';
				return;
			}

			let html = '<h3>Search Results (' + results.length + ' documents found)</h3>';
			
			results.forEach(result => {
				html += '<div class="result-item" data-path="' + result.path + '">';
				html += '<div class="result-id">' + result.id + '</div>';
				
				if (result.preview && result.preview.length > 0) {
					html += '<div class="result-preview">';
					result.preview.forEach(preview => {
						html += '<div class="preview-item">';
						html += '<span class="preview-field">' + preview.field + ':</span> ';
						html += JSON.stringify(preview.value);
						html += '</div>';
					});
					html += '</div>';
				}
				
				html += '</div>';
			});

			resultsContainer.innerHTML = html;

			// Add click handlers to result items
			document.querySelectorAll('.result-item').forEach(item => {
				item.addEventListener('click', () => {
					const path = item.getAttribute('data-path');
					vscode.postMessage({
						command: 'openDocument',
						path: path
					});
				});
			});
		}

		// Listen for messages from the extension
		window.addEventListener('message', event => {
			const message = event.data;
			switch (message.command) {
				case 'searchResults':
					showResults(message.results);
					break;
				case 'searchError':  
					showError(message.error);
					break;
			}
		});

		// Focus the search input
		searchInput.focus();
	</script>
</body>
</html>`;
}
