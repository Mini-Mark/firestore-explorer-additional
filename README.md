# Firestore Explorer

A simple Visual Studio Code Extension for listing, viewing and editing Firebase Firestore Database collections and documents using JSON syntax.

This is a work in progress. Many critical features are still missing and unexpected behavior may occur. Contributions are welcome.

**Be careful:** this is not an official Firebase product. This extension relies on the [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup) and its usage will generate reads and writes that may impact your Firebase billing.

![Demo](https://user-images.githubusercontent.com/54476193/162635495-b9a7d369-a090-4aa8-a874-5ff1a2e45738.gif)

## How to use

To use this extension you will need to generate a Firebase service account from your Firebase console, as explained in the [Firebase Admin SDK documentation](https://firebase.google.com/docs/admin/setup#set-up-project-and-service-account).

Provide a path to the service account JSON file in the `serviceAccountKeyPath` setting. You can also use the "Firestore Explorer: Initialize" command from the Command Palette to quickly reach the setting field.

## Features

After configuring the extension with your service account, open the Firestore Explorer View in the activity bar to:

- navigate all the collections and documents of your project (items will be loaded only when needed and paged to minimize the number of API requests);

- **switch between two view modes**:
  - **Firebase Mode** (default): Traditional Firebase structure showing Collections → Documents → Sub-collections
  - **Detailed Mode**: Shows all unique keys/fields found within each collection with sample values and occurrence counts

- **enhanced copy path functionality**: 
  - Firebase mode: copies Firestore paths (e.g., `users/user123/posts`)
  - Detailed mode: copies JSON-style paths (e.g., `users[0].address.street`)

- sort documents in a collection by a specified field and direction;

- view and edit the content of any document as a simple JSON file, taking advantage of the full power of vscode editor. Just save the file it to immediately update the document in the database.

### View Mode Toggle

Use the tree icon (🌳) in the toolbar or the "Firestore Explorer: Toggle View Mode" command to switch between:
- **Firebase Mode**: Navigate through collections and documents as you would in Firebase console
- **Detailed Mode**: Analyze data structure by viewing all available keys/fields within collections

See [VIEW_MODE_FEATURE.md](VIEW_MODE_FEATURE.md) for detailed documentation.

## Extension Settings

- `serviceAccountKeyPath`: path to the service account JSON file
- `projectId`: the project ID of your Firebase project
- `viewMode`: display mode - `firebase` (default) shows Firebase structure, `detailed` shows all keys within collections
- `pagingLimit`: number of documents to show for each collection (default: 10)

## Known Issues

- Special field types such as `geopoint` and `timestamp` are not correctly handled due to the JSON conversion.

- Creating and deleting documents and collections is not supported yet.

- There are no options for filtering documents.
