import * as vscode from 'vscode';
import { GitService } from '../services/gitService';
import { AIService } from '../services/aiService';
import { GitReference, DiffAnalysis, FileDiff } from '../models/gitTypes';

/**
 * WebView provider for the AI analysis view
 */
export class AnalysisViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'intellidiffAnalysis';
  private _view?: vscode.WebviewView;
  private _currentFileDiff?: FileDiff;
  private _currentAnalysis?: DiffAnalysis;
  private _isLoading: boolean = false;
  
  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _gitService: GitService,
    private readonly _aiService: AIService
  ) {}
  
  /**
   * Analyze a specific file
   */
  public async analyzeFile(
    baseRef: GitReference,
    compareRef: GitReference,
    filePath: string
  ): Promise<void> {
    this._isLoading = true;
    
    try {
      // Update the view to show loading state
      if (this._view) {
        this._view.webview.html = this._getLoadingHtml(filePath);
      }
      
      // Get the file diff
      this._currentFileDiff = await this._gitService.getFileDiff(
        baseRef,
        compareRef,
        filePath
      );
      
      // If it's a binary file, handle specially
      if (this._currentFileDiff.isBinary) {
        if (this._view) {
          this._view.webview.html = this._getBinaryFileHtml(this._currentFileDiff);
        }
        this._isLoading = false;
        return;
      }
      
      // Get the AI analysis
      this._currentAnalysis = await this._aiService.analyzeFileDiff(this._currentFileDiff);
      
      // Update the view - Fixed optional chaining assignment
      if (this._view) {
        const view = this._view;
        view.webview.html = this._getAnalysisHtml();
      }
    } catch (error) {
      console.error('Error analyzing file:', error);
      
      // Show error in view
      if (this._view) {
        this._view.webview.html = this._getErrorHtml(`Failed to analyze file: ${error}`);
      }
    } finally {
      this._isLoading = false;
    }
  }
  
  /**
   * Ask a question about the current file
   */
  public async askQuestion(question: string): Promise<void> {
    if (!this._currentFileDiff || this._isLoading) {
      return;
    }
    
    this._isLoading = true;
    
    try {
      // Update the view to show that we're processing the question
      if (this._view) {
        this._view.webview.postMessage({
          command: 'processingQuestion',
          question
        });
      }
      
      // Get answer from AI service
      const answer = await this._aiService.askQuestion(this._currentFileDiff, question);
      
      // Update the view with the answer
      if (this._view) {
        this._view.webview.postMessage({
          command: 'questionAnswer',
          question,
          answer
        });
      }
    } catch (error) {
      console.error('Error processing question:', error);
      
      // Send error to view
      if (this._view) {
        this._view.webview.postMessage({
          command: 'questionError',
          question,
          error: `Failed to process question: ${error}`
        });
      }
    } finally {
      this._isLoading = false;
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
        case 'askQuestion':
          await this.askQuestion(message.question);
          break;
        case 'openFile':
          const document = await vscode.workspace.openTextDocument(message.filePath);
          await vscode.window.showTextDocument(document);
          
          // Highlight the range if provided
          if (message.startLine && message.endLine) {
            const startLine = Math.max(0, message.startLine - 1); // Convert to 0-based
            const endLine = message.endLine; // Include the end line
            
            const range = new vscode.Range(
              new vscode.Position(startLine, 0),
              new vscode.Position(endLine, 0)
            );
            
            // Reveal the range in the editor
            vscode.window.activeTextEditor?.revealRange(
              range,
              vscode.TextEditorRevealType.InCenter
            );
            
            // Highlight the range
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                editor.selection = new vscode.Selection(
                    range.start,
                    range.end
                );
            }
          }
          break;
      }
    });
  }
  
  /**
   * Get initial HTML before any analysis is done
   */
  private _getInitialHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IntelliDiff Analysis</title>
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
    </style>
</head>
<body>
    <div class="container">
        <h3>AI Analysis</h3>
        <div class="message">
            Select a file from the diff view to analyze changes.
        </div>
    </div>
</body>
</html>`;
  }
  
  /**
   * Get HTML for the loading state
   */
  private _getLoadingHtml(filePath: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IntelliDiff Analysis</title>
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
        }
        .file-path {
            font-weight: bold;
            margin-bottom: 15px;
            word-break: break-all;
        }
        .loading {
            display: flex;
            align-items: center;
            margin: 20px 0;
            color: var(--vscode-descriptionForeground);
        }
        .spinner {
            border: 4px solid rgba(0, 0, 0, 0.1);
            border-left-color: var(--vscode-progressBar-background);
            border-radius: 50%;
            width: 20px;
            height: 20px;
            animation: spin 1s linear infinite;
            margin-right: 10px;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <h3>AI Analysis</h3>
        <div class="file-path">${filePath}</div>
        <div class="loading">
            <div class="spinner"></div>
            Analyzing changes...
        </div>
    </div>
</body>
</html>`;
  }
  
  /**
   * Get HTML for the analysis results
   */
  private _getAnalysisHtml(): string {
    if (!this._currentFileDiff || !this._currentAnalysis) {
      return this._getInitialHtml();
    }
    
    const filePath = this._currentFileDiff.newPath;
    const summary = this._currentAnalysis.summary;
    const changes = this._currentAnalysis.changes || [];
    const issues = this._currentAnalysis.potentialIssues || [];
    const suggestions = this._currentAnalysis.suggestions || [];
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IntelliDiff Analysis</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            padding: 0;
            margin: 0;
        }
        .container {
            padding: 15px;
            overflow: auto;
        }
        .file-path {
            font-weight: bold;
            margin-bottom: 15px;
            word-break: break-all;
        }
        .summary {
            margin-bottom: 20px;
            padding: 10px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 3px;
        }
        .section-title {
            font-weight: bold;
            margin: 15px 0 5px 0;
            color: var(--vscode-editor-foreground);
        }
        .change-item {
            margin-bottom: 15px;
            padding: 10px;
            border-radius: 3px;
            background-color: var(--vscode-list-inactiveSelectionBackground);
            cursor: pointer;
            transition: background-color 0.2s;
        }
        .change-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .change-lines {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 5px;
        }
        .change-description {
            margin-bottom: 8px;
        }
        .change-impact {
            font-style: italic;
            color: var(--vscode-descriptionForeground);
        }
        .issues-list, .suggestions-list {
            list-style-type: circle;
            padding-left: 20px;
            margin: 5px 0 10px 0;
        }
        .issues-list li, .suggestions-list li {
            margin-bottom: 5px;
        }
        .question-section {
            margin-top: 25px;
            border-top: 1px solid var(--vscode-panel-border);
            padding-top: 15px;
        }
        .question-form {
            display: flex;
            margin-bottom: 15px;
        }
        .question-input {
            flex-grow: 1;
            margin-right: 10px;
            padding: 6px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
        }
        .question-input:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        .question-button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            cursor: pointer;
            border-radius: 2px;
        }
        .question-button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .questions-history {
            margin-top: 15px;
        }
        .question-answer-pair {
            margin-bottom: 15px;
            animation: fadeIn 0.3s;
        }
        .question-text {
            font-weight: bold;
            margin-bottom: 5px;
        }
        .answer-text {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 8px;
            border-radius: 3px;
        }
        .no-items {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
    </style>
</head>
<body>
    <div class="container">
        <h3>AI Analysis</h3>
        <div class="file-path">${filePath}</div>
        
        <div class="summary">${summary}</div>
        
        <div class="section-title">Changes Analysis</div>
        ${changes.length > 0 ? 
            changes.map(change => `
            <div class="change-item" onclick="openFile('${filePath}', ${change.startLine}, ${change.endLine})">
                <div class="change-lines">Lines ${change.startLine}-${change.endLine}</div>
                <div class="change-description">${change.description}</div>
                ${change.impact ? `<div class="change-impact">${change.impact}</div>` : ''}
            </div>
            `).join('') :
            '<div class="no-items">No detailed changes analysis available.</div>'
        }
        
        ${issues.length > 0 ? `
        <div class="section-title">Potential Issues</div>
        <ul class="issues-list">
            ${issues.map(issue => `<li>${issue}</li>`).join('')}
        </ul>
        ` : ''}
        
        ${suggestions.length > 0 ? `
        <div class="section-title">Suggestions</div>
        <ul class="suggestions-list">
            ${suggestions.map(suggestion => `<li>${suggestion}</li>`).join('')}
        </ul>
        ` : ''}
        
        <div class="question-section">
            <div class="section-title">Ask about this change</div>
            <div class="question-form">
                <input type="text" class="question-input" id="questionInput" 
                    placeholder="E.g., Why was this code changed?" />
                <button class="question-button" onclick="askQuestion()">Ask</button>
            </div>
            <div class="questions-history" id="questionsHistory">
                <!-- Questions and answers will be added here -->
            </div>
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        let questionHistory = [];
        
        function openFile(filePath, startLine, endLine) {
            vscode.postMessage({
                command: 'openFile',
                filePath,
                startLine,
                endLine
            });
        }
        
        function askQuestion() {
            const input = document.getElementById('questionInput');
            const question = input.value.trim();
            
            if (!question) {
                return;
            }
            
            // Add the question to history
            addQuestionToHistory(question, 'Processing...');
            
            // Clear the input
            input.value = '';
            
            // Send the question to extension
            vscode.postMessage({
                command: 'askQuestion',
                question
            });
        }
        
        function addQuestionToHistory(question, answer) {
            const historyContainer = document.getElementById('questionsHistory');
            
            // Create new question-answer pair
            const pair = document.createElement('div');
            pair.className = 'question-answer-pair';
            pair.innerHTML = \`
                <div class="question-text">Q: \${question}</div>
                <div class="answer-text" id="answer-\${questionHistory.length}">\${answer}</div>
            \`;
            
            // Add to container
            historyContainer.appendChild(pair);
            
            // Save to history
            questionHistory.push({
                question,
                answerId: \`answer-\${questionHistory.length}\`
            });
        }
        
        // Handle enter key in input
        document.getElementById('questionInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                askQuestion();
            }
        });
        
        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'processingQuestion':
                    // Already handled when question is asked
                    break;
                    
                case 'questionAnswer':
                    // Find the question in history and update answer
                    if (questionHistory.length > 0) {
                        const lastQuestion = questionHistory[questionHistory.length - 1];
                        document.getElementById(lastQuestion.answerId).textContent = message.answer;
                    }
                    break;
                    
                case 'questionError':
                    // Find the question in history and update with error
                    if (questionHistory.length > 0) {
                        const lastQuestion = questionHistory[questionHistory.length - 1];
                        document.getElementById(lastQuestion.answerId).textContent = 
                            'Error: ' + message.error;
                    }
                    break;
            }
        });
    </script>
</body>
</html>`;
  }
  
  /**
   * Get HTML for binary file display
   */
  private _getBinaryFileHtml(fileDiff: FileDiff): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IntelliDiff Binary File</title>
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
        }
        .file-path {
            font-weight: bold;
            margin-bottom: 15px;
            word-break: break-all;
        }
        .binary-notice {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 10px;
            border-radius: 3px;
            margin: 15px 0;
        }
        .binary-info {
            margin: 15px 0;
        }
        .info-item {
            margin-bottom: 8px;
        }
        .label {
            font-weight: bold;
            margin-right: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h3>Binary File Analysis</h3>
        <div class="file-path">${fileDiff.newPath}</div>
        
        <div class="binary-notice">
            This is a binary file. Detailed content analysis is not available.
        </div>
        
        <div class="binary-info">
            <div class="info-item">
                <span class="label">File status:</span>
                ${fileDiff.status}
            </div>
            
            <div class="info-item">
                <span class="label">File path:</span>
                ${fileDiff.newPath}
            </div>
            
            <div class="info-item">
                <span class="label">File type:</span>
                ${this._getBinaryFileType(fileDiff.newPath)}
            </div>
        </div>
        
        <div class="binary-info">
            <p>For binary files, you can:</p>
            <ul>
                <li>Use external diff tools for specific file types</li>
                <li>Check metadata changes where available</li>
                <li>Open the files directly to view their contents</li>
            </ul>
        </div>
    </div>
</body>
</html>`;
  }
  
  /**
   * Determine the type of binary file based on extension
   */
  private _getBinaryFileType(filePath: string): string {
    const extension = filePath.split('.').pop()?.toLowerCase();
    
    if (!extension) {
      return 'Unknown binary file';
    }
    
    const fileTypes: Record<string, string> = {
      'png': 'PNG Image',
      'jpg': 'JPEG Image',
      'jpeg': 'JPEG Image',
      'gif': 'GIF Image',
      'bmp': 'Bitmap Image',
      'svg': 'SVG Image (text-based)',
      'pdf': 'PDF Document',
      'doc': 'Word Document',
      'docx': 'Word Document',
      'xls': 'Excel Spreadsheet',
      'xlsx': 'Excel Spreadsheet',
      'ppt': 'PowerPoint Presentation',
      'pptx': 'PowerPoint Presentation',
      'zip': 'ZIP Archive',
      'tar': 'TAR Archive',
      'gz': 'GZIP Archive',
      'exe': 'Windows Executable',
      'dll': 'Windows Dynamic Link Library',
      'so': 'Shared Object Library',
      'o': 'Object File',
      'class': 'Java Class File',
      'jar': 'Java Archive',
      'pyc': 'Python Compiled File'
    };
    
    return fileTypes[extension] || `Binary file (${extension})`;
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
    </style>
</head>
<body>
    <h3>Analysis Error</h3>
    <div class="error">${errorMessage}</div>
</body>
</html>`;
  }
}