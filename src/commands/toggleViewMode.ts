import * as vscode from "vscode";

/**
 * Toggles between Firebase structure view mode and detailed key view mode
 */
export default async function toggleViewMode(): Promise<void> {
	const config = vscode.workspace.getConfiguration("firestore-explorer");
	const currentMode = config.get("viewMode") as string;

	const newMode = currentMode === "firebase" ? "detailed" : "firebase";

	await config.update("viewMode", newMode, vscode.ConfigurationTarget.Global);

	// Show status message to user
	const modeDescription =
		newMode === "firebase" ? "Firebase Structure" : "Detailed Keys";
	vscode.window.showInformationMessage(
		`Switched to ${modeDescription} view mode`
	);
}
