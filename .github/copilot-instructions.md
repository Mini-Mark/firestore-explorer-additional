# Firestore Explorer VS Code Extension - AI Coding Agent Instructions

## Project Architecture

This is a **VS Code extension** for browsing and editing Firebase Firestore databases. The extension uses a **dual-provider architecture**:

1. **TreeDataProvider** (`ExplorerDataProvider`) - Hierarchical navigation in sidebar
2. **FileSystemProvider** (`DocumentFileSystemProvider`) - Documents as editable JSON files

Key architectural insight: Documents are treated as virtual files using the custom URI scheme `firestore-explorer:/path/to/doc`, enabling native VS Code editing features.

## Essential Workflows

### Build & Development
```bash
npm run watch          # Development build with hot reload
npm run compile        # One-time build  
npm run test-compile   # TypeScript-only compilation
```

**Critical**: Always run `npm run watch` before debugging. The extension uses webpack, not direct TypeScript compilation.

### Extension Testing
- Press `F5` to launch Extension Development Host
- Use "Run Extension" launch configuration (requires preLaunchTask)
- Extension activates on first command or when tree view opens

## Key Patterns & Conventions

### Firebase Integration Pattern
All Firestore operations go through `initializeFirestore()`:
```typescript
const firestore = await initializeFirestore();
const doc = firestore.doc(path);
```
- Handles service account authentication
- Shows user-friendly setup prompts on missing config
- Manages Firebase app singleton lifecycle

### Tree Item State Management
Tree items use immutable builder pattern:
```typescript
// CORRECT: Create new instances
element.withSize(newSize).withSampleData(data)

// WRONG: Mutate existing instances  
element.size = newSize;
```

Items maintain path-based state in `ExplorerDataProvider`:
- `_paging: { [path: string]: number }` - Pagination limits per collection
- `_orderBy: { [path: string]: {...} }` - Sort configuration per collection

### Data Type Handling
Firestore types are simplified for JSON display:
- Timestamps → `{ _timestamp: "ISO_STRING" }`
- GeoPoints → `{ _geopoint: { lat, lng } }`
- References → `{ _reference: "path/string" }`

See `simplifyValue()` in `ExplorerDataProvider.ts` for complete mapping.

### Command Registration Pattern
All commands follow this pattern in `extension.ts`:
```typescript
context.subscriptions.push(
  vscode.commands.registerCommand("firestore-explorer.commandName", handler)
);
```

Commands are split by purpose:
- `commands/` - User-invoked actions
- Tree item context menus defined in `package.json` → `menus.view/item/context`

## Critical Configuration

### TypeScript Setup
Uses `skipLibCheck: true` in `tsconfig.json` to avoid Firebase Admin SDK type conflicts. This is intentional - do not remove.

### Extension Manifest (`package.json`)
- `activationEvents` controls when extension loads
- `main: "./out/extension.js"` points to webpack output (not TypeScript)
- Tree view visibility: `"when": "config.firestore-explorer.serviceAccountKeyPath != ''"`

### Custom File System
Documents use custom scheme registered in `extension.ts`:
```typescript
vscode.workspace.registerFileSystemProvider(scheme, new DocumentFileSystemProvider())
```

## Data Flow Understanding

### Tree Navigation Flow
1. User expands collection → `getChildren()` → Firestore query with pagination
2. Items created with sample data during query (not lazily)
3. `getTreeItem()` called for display metadata and tooltips

### Document Editing Flow  
1. User clicks document → `openDocument()` command
2. Custom URI opens → `DocumentFileSystemProvider.readFile()`
3. User saves → `writeFile()` → Direct Firestore update

### Tooltip Enhancement System
Recent feature: Rich tooltips with sample JSON data
- Document tooltips show first 5 fields with truncated values
- Collection tooltips show sort order and document count
- Data fetching happens during tree item creation for performance

## Common Gotchas

1. **Webpack vs TypeScript**: Extension runs from `./out/extension.js` (webpack), not TypeScript output
2. **Firebase Singleton**: Multiple `initializeFirestore()` calls are safe - returns cached instance
3. **Path Semantics**: Even segments = documents, odd segments = collections
4. **Pagination State**: Collection expansion state persists in `_paging` until refresh
5. **Configuration Changes**: Auto-trigger Firebase re-initialization and tree refresh

## Extension Points for New Features

- **Commands**: Add to `commands/` directory + register in `extension.ts`
- **Tree Context**: Define in `package.json` → `menus.view/item/context`  
- **File Operations**: Extend `DocumentFileSystemProvider` for create/delete
- **Data Display**: Modify `simplifyValue()` for new Firestore types

## Testing Strategy
Currently minimal - focus on:
- Integration tests via Extension Development Host
- Firebase emulator for safe testing
- Mock `initializeFirestore()` for unit tests

Always read `SUMMARY.md` first and update `SUMMARY.md` when making architectural changes to maintain this knowledge base for future AI assistance.