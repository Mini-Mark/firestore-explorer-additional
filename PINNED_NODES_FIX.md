# Pinned Nodes Always Show at Top - Fix

## Problem
When you had pinned nodes in a collection with more than 10 documents (default limit), the pinned nodes might not appear in the initial load because they weren't in the first 10 documents. You had to click "Show All" first to load all documents before your pinned nodes would appear, which was a bad user experience.

## Solution
Modified the data loading logic to always load pinned documents first, regardless of the pagination limit. Now pinned documents are:

1. **Loaded separately first** - Before loading the regular paginated documents
2. **Always displayed at the top** - Pinned documents appear first in the list
3. **Don't count against the limit** - If you have 3 pinned documents and a limit of 10, you'll see 13 documents total (3 pinned + 10 regular)

## Changes Made

### ExplorerDataProvider.ts
- Modified `getCollectionDocuments()` to load pinned documents first
- Added `getPinnedDocumentIdsInCollection()` helper method to identify which documents in a collection are pinned
- Pinned documents are fetched individually before the regular query
- Regular documents exclude already-loaded pinned documents to avoid duplicates

### PinnedDataProvider.ts
- Applied the same logic to `getCollectionChildren()` for consistency
- Added the same `getPinnedDocumentIdsInCollection()` helper method
- Ensures pinned documents always appear first in the pinned view as well
- **Removed pagination** - The pinned items panel now always loads and displays all pinned items without any "Load 10 more" button
- Removed `_paging` state management from PinnedDataProvider
- Removed `showMoreItems()` method from PinnedDataProvider
- Removed `PinnedShowMoreItemsItem` usage

### extension.ts
- Removed `firestore-pinned.showMoreItems` command registration

### package.json
- Removed `firestore-pinned.showMoreItems` command definition and activation event

## Benefits
- ✅ Pinned nodes are always visible immediately when you expand a collection
- ✅ No need to click "Show All" to see your pinned items
- ✅ Better user experience - pinned items are truly "pinned" to the top
- ✅ Works with any pagination limit setting
- ✅ Maintains existing sorting behavior for non-pinned items
- ✅ **Pinned items panel always shows all pinned items without pagination**
