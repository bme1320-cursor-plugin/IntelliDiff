# IntelliDiff - Git Diff with AI Analysis

Advanced Git diff tool with AI-powered code change analysis for VS Code.

## Features

*   Compare different Git versions (branches, commits, tags).
*   View file diffs side-by-side.
*   Get AI-powered analysis of code changes, including summaries, potential issues, and suggestions.
*   Ask follow-up questions about the code changes.

## Getting Started

### Prerequisites

*   Node.js and pnpm installed.
*   Git installed.

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository_url>
    cd IntelliDiff
    ```
2.  Install dependencies:
    ```bash
    pnpm install
    ```

### Building the Extension

To build the extension for development or packaging:

```bash
pnpm run compile # For development builds with source maps
# or
pnpm run watch   # For continuous development builds
# or
pnpm run package # For production builds (used for packaging/publishing)
```

Compiled JavaScript files will be placed in the `dist` directory.

### Running in VS Code

1.  Open the project folder in VS Code.
2.  Press `F5` to open a new VS Code window with the extension loaded (Extension Development Host).
3.  Use the IntelliDiff commands available in the SCM view title bar or command palette.

## Project Structure

*   `src/`: Contains the extension's source code.
    *   `commands/`: Registers VS Code commands.
    *   `models/`: Defines data structures used in the extension.
    *   `providers/`: Implements VS Code view providers (e.g., for the diff view, analysis view).
    *   `services/`: Contains services for interacting with Git, AI APIs, etc.
    *   `utils/`: Utility functions.
    *   `extension.ts`: The main activation file for the extension.
*   `dist/`: Contains the compiled JavaScript output.
*   `package.json`: Declares dependencies, scripts, and VS Code contributions.
*   `tsconfig.json`: TypeScript configuration for the project.

## Troubleshooting

*   **`Cannot find module '...'` errors during `pnpm run package`:**
    *   Ensure all dependencies are installed: `pnpm install`.
    *   Check the `tsconfig.json` file. The configuration should be suitable for a VS Code extension, typically using `"module": "CommonJS"` and `"moduleResolution": "node"`. Ensure `"noEmit": true` is *not* set, and an `"outDir"` (e.g., `"dist"`) is specified.
*   **`Optional chaining cannot appear in left-hand side` / `The left-hand side of an assignment expression may not be an optional property access` errors:**
    *   This occurs when trying to assign a value to a property accessed via optional chaining (`?.`).
    *   **Fix:** Check if the object exists *before* attempting to assign to its property. For example:
        ```typescript
        // Instead of:
        // myObject?.property = value;

        // Do this:
        const obj = myObject;
        if (obj) {
            obj.property = value;
        }
        ```

## Requirements

- Visual Studio Code 1.60.0 or higher
- Git installed and available in your PATH
- Python 3.6+ for AI analysis capabilities

## Extension Settings

This extension contributes the following settings:

* `intellidiff.pythonPath`: Path to Python executable for AI analysis
* `intellidiff.enableDeepAnalysis`: Enable more detailed AI analysis (may be slower)

## Getting Started

1. Install the extension
2. Open a Git repository in VS Code
3. Use the command palette (`Ctrl+Shift+P`) and select "IntelliDiff: Compare Git Versions"
4. Select the base and compare references
5. Browse the changed files and click on one to analyze

## How to Use

### Comparing Git Versions

1. Run the "IntelliDiff: Compare Git Versions" command
2. Select base reference (e.g., a branch, commit, or tag)
3. Select compare reference
4. View the list of changed files in the IntelliDiff Explorer view

### Analyzing Changes

1. Click on a file in the IntelliDiff Explorer view
2. View the AI analysis in the Analysis panel
3. Navigate through the changes
4. Click on specific changes to navigate to them in the editor

### Asking Questions

1. Open the Analysis panel
2. Type your question in the input box (e.g., "Why was this code changed?")
3. View the AI-generated answer

## Known Issues

- Analysis of very large files may be slow
- Python must be installed for AI capabilities to work
- Currently limited binary file support

## Release Notes

### 0.1.0

- Initial release
- Basic Git diff comparison
- AI-powered code change analysis
- Interactive Q&A
- Binary file basic support

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This extension is licensed under the [MIT License](LICENSE.md).