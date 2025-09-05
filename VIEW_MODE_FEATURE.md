# View Mode Feature Documentation

## Overview
The Firestore Explorer extension now## Technical Details

- **Sampling**: Detailed mode analyzes up to 100 documents per collection for key discovery
- **Nested Analysis**: When expanding keys, analyzes up to 50 documents for nested property discovery
- **Performance**: Keys and nested keys are cached and sorted alphabetically
- **Deep Exploration**: Supports unlimited nesting levels for object exploration
- **Smart Detection**: Automatically detects expandable objects vs simple values
- **Data Types**: Handles all Firestore data types including timestamps, references, and geopoints
- **Icons**: Different visual indicators for simple keys (🔑), object keys (📦), and nested properties (🔧)
- **Context Menus**: Ordering is only available in Firebase mode for collectionsrts two different view modes to help you explore your Firestore database structure in different ways.

## View Modes

### 1. Firebase Mode (Default)
- **Description**: Shows the traditional Firebase/Firestore structure
- **Display**: Collections → Documents → Sub-collections
- **Use Case**: Navigate through your database hierarchy as you would in the Firebase console
- **Features**: 
  - Shows document IDs and sample data
  - Allows ordering and pagination
  - Preserves the natural Firebase structure

### 2. Detailed Mode
- **Description**: Shows all unique keys/fields found within each collection with deep drill-down capability
- **Display**: Collections → Keys/Fields → Nested Properties (if applicable)
- **Use Case**: Analyze data structure, find all available fields, understand data patterns, explore nested object structures
- **Features**:
  - Shows all unique keys found in documents within a collection
  - Displays sample values for each key
  - Shows how many documents contain each key
  - **Deep Exploration**: Expandable keys for object-type values to explore nested properties
  - Sorted alphabetically for easy browsing
  - Different icons for simple keys (🔑) vs object keys (📦)

## How to Use

### Switching View Modes
1. **Toolbar Button**: Click the list-tree icon (🌳) in the Firestore Explorer view toolbar
2. **Command Palette**: 
   - Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
   - Type "Firestore Explorer: Toggle View Mode"
   - Press Enter

### Configuration
You can also set the default view mode in VS Code settings:
1. Open VS Code Settings (`Ctrl+,` / `Cmd+,`)
2. Search for "firestore-explorer.viewMode"
3. Choose between:
   - `firebase` (default) - Traditional Firebase structure
   - `detailed` - Shows keys/fields within collections

## Examples

### Firebase Mode
```
📁 users (collection)
├── 📄 user1 (document)
├── 📄 user2 (document)
└── 📄 user3 (document)
```

### Detailed Mode
```
📁 users (collection)
├── 🔑 email (3 docs) "user@example.com", "admin@test.com"...
├── 🔑 name (3 docs) "John Doe", "Jane Smith"...
├── 🔑 age (2 docs) 25, 30
├── 🔑 isActive (3 docs) true, false
└── 📦 address (3 docs) [Object] - Expandable!
    ├── 🔧 street (3 docs) "123 Main St", "456 Oak Ave"...
    ├── 🔧 city (3 docs) "New York", "Los Angeles"...
    ├── 🔧 zipCode (2 docs) "10001", "90210"
    └── 📦 coordinates (1 doc) [Object] - Further nested!
        ├── 🔧 lat (1 doc) 40.7128
        └── 🔧 lng (1 doc) -74.0060
```

## Benefits

### Firebase Mode
- Familiar navigation pattern
- Direct access to specific documents
- Shows actual document hierarchy

### Detailed Mode
- Quick schema discovery
- Identify missing fields across documents
- Understand data consistency
- **Deep object exploration** for nested data structures
- **Visual hierarchy** showing object relationships
- Perfect for data analysis and validation

## Technical Details

- **Sampling**: Detailed mode analyzes up to 100 documents per collection for key discovery
- **Performance**: Keys are cached and sorted alphabetically
- **Data Types**: Handles all Firestore data types including timestamps, references, and geopoints
- **Context Menus**: Ordering is only available in Firebase mode for collections

## Notes

- The view mode setting is persistent and will be remembered between VS Code sessions
- Switching modes refreshes the tree view automatically
- In detailed mode, you can still copy key paths using the context menu
- **Deep Drilling**: Click expand arrows (▶) on object keys to explore nested properties
- **Unlimited Depth**: You can drill down through multiple levels of nested objects
- **Smart Icons**: Visual indicators help distinguish between simple values and expandable objects
- Ordering and pagination features are only available in Firebase mode
