import * as vscode from 'vscode';
import { GitService } from '../services/gitService';
import { DiffFile, GitReference, FileStatus } from '../models/gitTypes';

/**
 * WebView provider for the diff explorer view
 */
export class DiffViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'intellidiffExplorer';
  private _view?: vscode.WebviewView;
  private _files: DiffFile[] = [];
  private _baseRef?: GitReference;
  private _compareRef?: GitReference;
  
  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _gitService: GitService
  ) {}
  
  /**
   * Load the diff view with file comparison between two refs
   */
  public async loadDiffView(baseRef: GitReference, compareRef: GitReference): Promise<void> {
    this._baseRef = baseRef;
    this._compareRef = compareRef;
    
    try {
      // Get the list of changed files
      this._files = await this._gitService.compareRefs(baseRef, compareRef);
      
      // Update the view if it exists
      if (this._view) {
        this._view.webview.html = this._getHtmlForWebview();
      }
    } catch (error) {
      console.error('Error loading diff view:', error);
      vscode.window.showErrorMessage(`Error loading diff view: ${error}`);
      
      // Show error in view
      if (this._view) {
        this._view.webview.html = this._getErrorHtml(`Failed to load diff: ${error}`);
      }
    }
  }
  
  /**
   * Resolve the webview view
   */
  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext<unknown>,
    token: vscode.CancellationToken
  ): void | Thenable<void> {
    this._view = webviewView;
    
    // Set options for the webview
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };
    
    // Set initial content
    webviewView.webview.html = this._getInitialHtml();
    
    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'selectFile':
          await vscode.commands.executeCommand('intellidiff.selectFile', message.filePath);
          break;
        case 'refresh':
          if (this._baseRef && this._compareRef) {
            await this.loadDiffView(this._baseRef, this._compareRef);
          }
          break;
      }
    });
    
    // Load content if we already have refs
    if (this._baseRef && this._compareRef) {
      this.loadDiffView(this._baseRef, this._compareRef);
    }
  }
  
  /**
   * Get initial HTML before any comparison is done
   */
  private _getInitialHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IntelliDiff</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            padding: 0;
            margin: 0;
        }
        .container {
            padding: 20px;
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        .message {
            margin: 20px 0;
            color: var(--vscode-descriptionForeground);
        }
        .button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 14px;
            border-radius: 2px;
            margin-top: 10px;
        }
        .button:hover {
            background: var(--vscode-button-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="container">
        <h3>Git Diff Explorer</h3>
        <div class="message">
            No files to compare. Please select Git versions to compare.
        </div>
        <button class="button" onclick="compareDiff()">Compare Git Versions</button>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        
        function compareDiff() {
            vscode.postMessage({
                command: 'refresh'
            });
        }
    </script>
</body>
</html>`;
  }
  
  /**
   * Get HTML for the diff view with file list
   */
  private _getHtmlForWebview(): string {
    const baseRefName = this._baseRef?.name || 'Unknown';
    const compareRefName = this._compareRef?.name || 'Unknown';
    
    // Group files by status
    const addedFiles = this._files.filter(f => f.status === FileStatus.ADDED);
    const modifiedFiles = this._files.filter(f => f.status === FileStatus.MODIFIED);
    const deletedFiles = this._files.filter(f => f.status === FileStatus.DELETED);
    const renamedFiles = this._files.filter(f => f.status === FileStatus.RENAMED);
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IntelliDiff</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            padding: 0;
            margin: 0;
        }
        .container {
            padding: 10px;
        }
        .file-list {
            margin-top: 10px;
            overflow: auto;
        }
        .file-group {
            margin-bottom: 15px;
        }
        .file-group-header {
            font-weight: bold;
            margin-bottom: 5px;
            color: var(--vscode-editor-foreground);
        }
        .file-item {
            display: flex;
            padding: 4px 8px;
            border-radius: 3px;
            margin-bottom: 2px;
            cursor: pointer;
            font-size: 13px;
            align-items: center;
        }
        .file-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .file-icon {
            margin-right: 6px;
            height: 16px;
            width: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .file-name {
            flex-grow: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .file-stat {
            font-size: 11px;
            margin-left: 8px;
            color: var(--vscode-descriptionForeground);
        }
        .file-add {
            color: var(--vscode-gitDecoration-addedResourceForeground, #81c995);
        }
        .file-mod {
            color: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d);
        }
        .file-del {
            color: var(--vscode-gitDecoration-deletedResourceForeground, #c74e39);
        }
        .file-ren {
            color: var(--vscode-gitDecoration-renamedResourceForeground, #73c991);
        }
        .file-bin {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 8px;
        }
        .refs {
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
        }
        .button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 8px;
            cursor: pointer;
            font-size: 13px;
            border-radius: 2px;
        }
        .button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .no-files {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="refs">
                <strong>${compareRefName}</strong> ← <strong>${baseRefName}</strong>
            </div>
            <button class="button" onclick="compareDiff()">Change</button>
        </div>
        
        <div class="file-list">
            ${this._files.length === 0 ? '<div class="no-files">No changes found between these references</div>' : ''}
            
            ${addedFiles.length > 0 ? `
            <div class="file-group">
                <div class="file-group-header">Added (${addedFiles.length})</div>
                ${addedFiles.map(file => this._renderFileItem(file, 'add')).join('')}
            </div>` : ''}
            
            ${modifiedFiles.length > 0 ? `
            <div class="file-group">
                <div class="file-group-header">Modified (${modifiedFiles.length})</div>
                ${modifiedFiles.map(file => this._renderFileItem(file, 'mod')).join('')}
            </div>` : ''}
            
            ${deletedFiles.length > 0 ? `
            <div class="file-group">
                <div class="file-group-header">Deleted (${deletedFiles.length})</div>
                ${deletedFiles.map(file => this._renderFileItem(file, 'del')).join('')}
            </div>` : ''}
            
            ${renamedFiles.length > 0 ? `
            <div class="file-group">
                <div class="file-group-header">Renamed (${renamedFiles.length})</div>
                ${renamedFiles.map(file => this._renderFileItem(file, 'ren')).join('')}
            </div>` : ''}
        </div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        
        function selectFile(filePath) {
            vscode.postMessage({
                command: 'selectFile',
                filePath: filePath
            });
        }
        
        function compareDiff() {
            vscode.postMessage({
                command: 'refresh'
            });
        }
    </script>
</body>
</html>`;
  }
  
  /**
   * Render a single file item in the list
   */
  private _renderFileItem(file: DiffFile, fileType: 'add' | 'mod' | 'del' | 'ren'): string {
    const filePath = file.status === FileStatus.DELETED ? file.oldPath : file.newPath;
    
    let iconChar = '';
    switch (fileType) {
      case 'add': iconChar = '+'; break;
      case 'mod': iconChar = '●'; break;
      case 'del': iconChar = '–'; break;
      case 'ren': iconChar = '→'; break;
    }
    
    const statistics = file.status === FileStatus.DELETED ? '' : 
      `<span class="file-stat">+${file.additions} -${file.deletions}</span>`;
    
    const binaryClass = file.isBinary ? ' file-bin' : '';
    const binaryLabel = file.isBinary ? ' (binary)' : '';
    
    // For renamed files, show old → new
    const fileName = file.status === FileStatus.RENAMED ? 
      `${file.oldPath} → ${file.newPath}` : 
      filePath;
    
    return `
    <div class="file-item" onclick="selectFile('${filePath.replace(/'/g, "\\'")}')">
        <div class="file-icon file-${fileType}">${iconChar}</div>
        <div class="file-name${binaryClass}">${fileName}${binaryLabel}</div>
        ${statistics}
    </div>`;
  }
  
  /**
   * Get HTML for error display
   */
  private _getErrorHtml(errorMessage: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IntelliDiff Error</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            padding: 20px;
        }
        .error {
            color: var(--vscode-errorForeground);
            margin-bottom: 20px;
        }
        .button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 14px;
            border-radius: 2px;
        }
        .button:hover {
            background: var(--vscode-button-hoverBackground);
        }
    </style>
</head>
<body>
    <h3>Error</h3>
    <div class="error">${errorMessage}</div>
    <button class="button" onclick="retry()">Try Again</button>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function retry() {
            vscode.postMessage({
                command: 'refresh'
            });
        }
    </script>
</body>
</html>`;
  }
}