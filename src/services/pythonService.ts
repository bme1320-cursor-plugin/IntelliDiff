import * as vscode from 'vscode';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import axios from 'axios';

/**
 * Service to manage the Python AI server
 */
export class PythonService {
    private serverProcess: ChildProcess | null = null;
    private readonly port: number = 5000;
    private readonly maxStartupAttempts: number = 3;
    private startupAttempts: number = 0;

    /**
     * Start the Python server
     */
    public async startServer(): Promise<void> {
        if (this.serverProcess) {
            return; // Server is already running
        }


        try {
            console.log('Async Starting Python server...');
            // Create Python script files
            await this.createPythonFiles();
            console.log('Python files created successfully');

            // Start the server
            await this.spawnServer();
            console.log('Python server process spawned successfully');

            // Wait for server to be ready
            await this.waitForServerReady();
            console.log('Python server is ready');

            this.startupAttempts = 0; // Reset counter on successful start
        } catch (error) {
            this.startupAttempts++;

            if (this.startupAttempts < this.maxStartupAttempts) {
                console.log(`Retry starting Python server (attempt ${this.startupAttempts})...`);
                await this.stopServer(); // Ensure previous attempt is cleaned up
                return this.startServer(); // Recursive retry
            }

            console.error('Failed to start Python server after multiple attempts:', error);
            throw new Error('Failed to start AI analysis server');
        }
    }

    /**
     * Create required Python script files
     */
    private async createPythonFiles(): Promise<void> {
        console.log('Creating Python files...');
        const extensionContext = this.getExtensionContext();
        console.log('Extension context:', extensionContext);
        const pythonDirPath = path.join(extensionContext.extensionPath, 'python');
        console.log('Creating Python files in:', pythonDirPath);

        try {
            // Create python directory if it doesn't exist
            await fs.mkdir(pythonDirPath, { recursive: true });

            // Create server.py file
            const serverPyPath = path.join(pythonDirPath, 'server.py');
            await fs.writeFile(serverPyPath, this.getServerPyContent());

            // Create analyzer.py file
            const analyzerPyPath = path.join(pythonDirPath, 'analyzer.py');
            await fs.writeFile(analyzerPyPath, this.getAnalyzerPyContent());

            // Create requirements.txt file
            const requirementsPath = path.join(pythonDirPath, 'requirements.txt');
            await fs.writeFile(requirementsPath, this.getRequirementsContent());

        } catch (error) {
            console.error('Error creating Python files:', error);
            throw new Error('Failed to create Python files');
        }
    }

    /**
     * Spawn the Python server process
     */
    private async spawnServer(): Promise<void> {
        const extensionContext = this.getExtensionContext();
        const pythonDirPath = path.join(extensionContext.extensionPath, 'python');
        const serverPyPath = path.join(pythonDirPath, 'server.py');
        console.log('Starting Python server at:', serverPyPath);

        // Get Python executable path
        const pythonPath = await this.getPythonPath();

        // Start the server process
        this.serverProcess = spawn(pythonPath, [serverPyPath], {
            cwd: pythonDirPath,
            env: { ...process.env, PORT: this.port.toString() }
        });

        // Handle process events
        this.serverProcess.stdout?.on('data', (data) => {
            console.log(`Python server stdout: ${data}`);
        });

        this.serverProcess.stderr?.on('data', (data) => {
            console.error(`Python server stderr: ${data}`);
        });

        this.serverProcess.on('error', (error) => {
            console.error('Python server process error:', error);
        });

        this.serverProcess.on('close', (code) => {
            console.log(`Python server process exited with code ${code}`);
            this.serverProcess = null;
        });
    }

    /**
     * Wait for the server to be ready
     */
    private async waitForServerReady(): Promise<void> {
        const maxRetries = 10;
        const retryInterval = 500; // ms

        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await axios.get(`http://localhost:${this.port}/health`);
                if (response.status === 200 && response.data.status === 'ok') {
                    console.log('Python server is ready');
                    return;
                }
            } catch (error) {
                // Server not ready yet, wait and retry
                await new Promise(resolve => setTimeout(resolve, retryInterval));
            }
        }

        throw new Error('Timed out waiting for Python server to be ready');
    }

    /**
     * Stop the Python server
     */
    public async stopServer(): Promise<void> {
        if (!this.serverProcess) {
            return; // Server is not running
        }

        try {
            // Try to gracefully shutdown the server
            await axios.post(`http://localhost:${this.port}/shutdown`).catch(() => { });

            // Give the server a chance to shutdown gracefully
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Force kill if still running
            if (this.serverProcess) {
                this.serverProcess.kill();
                this.serverProcess = null;
            }
        } catch (error) {
            console.error('Error stopping Python server:', error);

            // Force kill as fallback
            if (this.serverProcess) {
                this.serverProcess.kill();
                this.serverProcess = null;
            }
        }
    }

    /**
     * Get Python executable path
     */
    private async getPythonPath(): Promise<string> {
        // Try to get Python path from settings
        const config = vscode.workspace.getConfiguration('intellidiff');
        const pythonPath = config.get<string>('pythonPath');

        if (pythonPath) {
            return pythonPath;
        }

        // Default to 'python3' or 'python' based on platform
        return process.platform === 'win32' ? 'python' : 'python3';
    }

    /**
     * Get the extension context
     */
    private getExtensionContext(): vscode.ExtensionContext {
        const extension = vscode.extensions.getExtension('intellidiff.intellidiff');
        extension?.activate()

        if (!extension) {
            throw new Error('Extension context not available');
        }

        return extension.exports.getContext();
    }

    /**
     * Get server.py content
     */
    private getServerPyContent(): string {
        return `#!/usr/bin/env python3
import os
import json
import sys
from flask import Flask, request, jsonify
from analyzer import CodeAnalyzer

app = Flask(__name__)
analyzer = CodeAnalyzer()

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok"})

@app.route('/analyze', methods=['POST'])
def analyze_code():
    try:
        data = request.json
        file_path = data.get('filePath')
        old_content = data.get('oldContent', '')
        new_content = data.get('newContent', '')
        chunks = data.get('chunks', [])
        
        analysis = analyzer.analyze_diff(file_path, old_content, new_content, chunks)
        return jsonify(analysis)
    except Exception as e:
        print(f"Error in /analyze: {str(e)}", file=sys.stderr)
        return jsonify({"error": str(e)}), 500

@app.route('/ask', methods=['POST'])
def ask_question():
    try:
        data = request.json
        file_path = data.get('filePath')
        old_content = data.get('oldContent', '')
        new_content = data.get('newContent', '')
        chunks = data.get('chunks', [])
        question = data.get('question', '')
        
        answer = analyzer.answer_question(file_path, old_content, new_content, chunks, question)
        return jsonify({"answer": answer})
    except Exception as e:
        print(f"Error in /ask: {str(e)}", file=sys.stderr)
        return jsonify({"error": str(e)}), 500

@app.route('/shutdown', methods=['POST'])
def shutdown():
    func = request.environ.get('werkzeug.server.shutdown')
    if func is None:
        raise RuntimeError('Not running with the Werkzeug Server')
    func()
    return jsonify({"status": "shutting down"})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='127.0.0.1', port=port)
`;
    }

    /**
     * Get analyzer.py content
     */
    private getAnalyzerPyContent(): string {
        return `#!/usr/bin/env python3
import os
import re
import difflib
from typing import Dict, List, Any, Optional

class CodeAnalyzer:
    def __init__(self):
        self.language_patterns = {
            'javascript': ['.js', '.jsx', '.ts', '.tsx'],
            'python': ['.py'],
            'java': ['.java'],
            'c_cpp': ['.c', '.cpp', '.h', '.hpp'],
            'html': ['.html', '.htm'],
            'css': ['.css', '.scss', '.sass'],
            'php': ['.php'],
            'ruby': ['.rb'],
            'go': ['.go'],
            'rust': ['.rs'],
            'shell': ['.sh', '.bash'],
            'xml': ['.xml'],
            'json': ['.json'],
            'markdown': ['.md', '.markdown']
        }

    def detect_language(self, file_path: str) -> str:
        """Detect programming language based on file extension."""
        ext = os.path.splitext(file_path)[1].lower()
        
        for lang, extensions in self.language_patterns.items():
            if ext in extensions:
                return lang
        
        return 'unknown'

    def analyze_diff(self, file_path: str, old_content: str, new_content: str, chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze the differences between old and new content."""
        language = self.detect_language(file_path)
        
        # Extract file name from path
        file_name = os.path.basename(file_path)
        
        # Analyze changes
        change_analyses = []
        for i, chunk in enumerate(chunks):
            analysis = self._analyze_chunk(chunk, language, old_content, new_content)
            if analysis:
                change_analyses.append(analysis)
        
        # Generate summary
        summary = self._generate_summary(file_path, old_content, new_content, chunks, change_analyses)
        
        # Identify potential issues and suggestions
        issues = self._identify_issues(file_path, new_content, language, chunks)
        suggestions = self._generate_suggestions(language, file_path, old_content, new_content)
        
        return {
            "filePath": file_path,
            "summary": summary,
            "changes": change_analyses,
            "potentialIssues": issues,
            "suggestions": suggestions
        }

    def _analyze_chunk(self, chunk: Dict[str, Any], language: str, old_content: str, new_content: str) -> Optional[Dict[str, Any]]:
        """Analyze a single change chunk."""
        if not chunk.get('changes'):
            return None
            
        # Find the context of the changes
        start_line = chunk.get('newStart', 0)
        lines_count = chunk.get('newLines', 0)
        end_line = start_line + lines_count - 1 if lines_count > 0 else start_line
        
        # Description based on the type of change
        added = sum(1 for change in chunk.get('changes', []) if change.get('type') == 'add')
        deleted = sum(1 for change in chunk.get('changes', []) if change.get('type') == 'delete')
        
        description = self._describe_changes(added, deleted, chunk, language)
        
        # Determine impact based on the changes
        impact = self._determine_impact(chunk, language)
        
        return {
            "startLine": start_line,
            "endLine": end_line,
            "description": description,
            "impact": impact,
            "codeContext": self._extract_code_context(chunk, new_content)
        }

    def _describe_changes(self, added: int, deleted: int, chunk: Dict[str, Any], language: str) -> str:
        """Generate a description of the changes."""
        if added > 0 and deleted > 0:
            return f"Modified code section with {added} line additions and {deleted} line removals."
        elif added > 0:
            return f"Added {added} new lines of code."
        elif deleted > 0:
            return f"Removed {deleted} lines of code."
        else:
            return "Changed code with equivalent additions and deletions."

    def _determine_impact(self, chunk: Dict[str, Any], language: str) -> str:
        """Determine the potential impact of the changes."""
        changes = chunk.get('changes', [])
        
        # Look for specific patterns based on language
        if language == 'javascript' or language == 'typescript':
            if any('function' in change.get('content', '') for change in changes):
                return "This change modifies function definitions, which may affect behavior."
            elif any('import' in change.get('content', '') for change in changes):
                return "This change affects imports, which may change dependencies."
            elif any('export' in change.get('content', '') for change in changes):
                return "This change affects exports, which may impact module interfaces."
            
        elif language == 'python':
            if any('def ' in change.get('content', '') for change in changes):
                return "This change modifies function definitions, which may affect behavior."
            elif any('import ' in change.get('content', '') for change in changes):
                return "This change affects imports, which may change dependencies."
            elif any('class ' in change.get('content', '') for change in changes):
                return "This change modifies class definitions, which may affect object behavior."
        
        # Default impact message
        return "This change may affect application functionality."

    def _extract_code_context(self, chunk: Dict[str, Any], content: str) -> str:
        """Extract the context of the code changes."""
        if not content:
            return ""
            
        content_lines = content.split('\\n')
        start = max(0, chunk.get('newStart', 0) - 1)  # 0-indexed
        end = min(len(content_lines), start + chunk.get('newLines', 0) + 2)
        
        context_lines = content_lines[start:end]
        return '\\n'.join(context_lines)

    def _generate_summary(self, file_path: str, old_content: str, new_content: str, chunks: List[Dict[str, Any]], analyses: List[Dict[str, Any]]) -> str:
        """Generate a summary of all changes."""
        total_chunks = len(chunks)
        language = self.detect_language(file_path)
        file_name = os.path.basename(file_path)
        
        # Calculate total lines added and removed
        added = 0
        removed = 0
        for chunk in chunks:
            for change in chunk.get('changes', []):
                if change.get('type') == 'add':
                    added += 1
                elif change.get('type') == 'delete':
                    removed += 1
        
        # Simple semantic analysis based on language and changes
        semantic_changes = []
        
        if language == 'javascript' or language == 'typescript':
            if old_content and new_content:
                old_functions = re.findall(r'function\\s+([\\w$]+)\\s*\\(', old_content)
                new_functions = re.findall(r'function\\s+([\\w$]+)\\s*\\(', new_content)
                added_functions = set(new_functions) - set(old_functions)
                removed_functions = set(old_functions) - set(new_functions)
                
                if added_functions:
                    semantic_changes.append(f"Added function(s): {', '.join(added_functions)}")
                if removed_functions:
                    semantic_changes.append(f"Removed function(s): {', '.join(removed_functions)}")
        
        elif language == 'python':
            if old_content and new_content:
                old_functions = re.findall(r'def\\s+([\\w_]+)\\s*\\(', old_content)
                new_functions = re.findall(r'def\\s+([\\w_]+)\\s*\\(', new_content)
                added_functions = set(new_functions) - set(old_functions)
                removed_functions = set(old_functions) - set(new_functions)
                
                if added_functions:
                    semantic_changes.append(f"Added function(s): {', '.join(added_functions)}")
                if removed_functions:
                    semantic_changes.append(f"Removed function(s): {', '.join(removed_functions)}")
        
        # Build summary
        summary = f"File {file_name} was modified with {added} line additions and {removed} line removals across {total_chunks} section(s)."
        
        if semantic_changes:
            summary += " " + " ".join(semantic_changes)
        
        return summary

    def _identify_issues(self, file_path: str, content: str, language: str, chunks: List[Dict[str, Any]]) -> List[str]:
        """Identify potential issues in the code changes."""
        issues = []
        
        # Simple static analysis based on language
        if not content:
            return issues
            
        if language == 'javascript' or language == 'typescript':
            # Check for console.log statements
            if 'console.log' in content:
                issues.append("Debug statements (console.log) found, consider removing them before production.")
                
            # Check for TODO comments
            if 'TODO' in content:
                issues.append("TODO comments found, consider addressing them.")
                
        elif language == 'python':
            # Check for print statements
            if re.search(r'\\bprint\\(', content):
                issues.append("Print statements found, consider replacing with proper logging.")
                
            # Check for TODO comments
            if '# TODO' in content:
                issues.append("TODO comments found, consider addressing them.")
        
        return issues

    def _generate_suggestions(self, language: str, file_path: str, old_content: str, new_content: str) -> List[str]:
        """Generate suggestions based on the changes and language."""
        suggestions = []
        
        if not old_content or not new_content:
            return suggestions
            
        if language == 'javascript' or language == 'typescript':
            # Suggest adding tests if functions were added
            old_functions = set(re.findall(r'function\\s+([\\w$]+)\\s*\\(', old_content))
            new_functions = set(re.findall(r'function\\s+([\\w$]+)\\s*\\(', new_content))
            
            if new_functions - old_functions:
                suggestions.append("Consider adding tests for new functions.")
                
        elif language == 'python':
            # Suggest adding docstrings if functions were added
            if 'def ' in new_content and '\"\"\"' not in new_content:
                suggestions.append("Consider adding docstrings to document new functions.")
        
        return suggestions

    def answer_question(self, file_path: str, old_content: str, new_content: str, chunks: List[Dict[str, Any]], question: str) -> str:
        """Answer a specific question about the code changes."""
        language = self.detect_language(file_path)
        
        # Basic questions about the changes
        if "what changed" in question.lower():
            return self._describe_what_changed(old_content, new_content, chunks)
            
        elif "why" in question.lower() and "changed" in question.lower():
            return self._infer_why_changed(old_content, new_content, language)
            
        elif "impact" in question.lower() or "affect" in question.lower() or "effect" in question.lower():
            return self._describe_impact(chunks, language)
            
        elif "how many" in question.lower() and "lines" in question.lower():
            return self._count_changed_lines(chunks)
            
        # Default response
        return "I can analyze code changes to explain what changed, why it might have changed, and the potential impact of those changes. Could you be more specific with your question?"

    def _describe_what_changed(self, old_content: str, new_content: str, chunks: List[Dict[str, Any]]) -> str:
        """Describe what changed in the file."""
        if not old_content and new_content:
            return "This is a new file that was added."
            
        if old_content and not new_content:
            return "This file was removed."
            
        # Count modifications
        added = 0
        removed = 0
        for chunk in chunks:
            for change in chunk.get('changes', []):
                if change.get('type') == 'add':
                    added += 1
                elif change.get('type') == 'delete'):
                    removed += 1
        
        description = f"This file has {added} line additions and {removed} line removals. "
        
        if chunks:
            description += "The changes include:"
            for i, chunk in enumerate(chunks[:3]):  # Limit to first 3 chunks
                start_line = chunk.get('newStart', 0)
                description += f"\\n- Change {i+1}: Around line {start_line}"
                
            if len(chunks) > 3:
                description += f"\\n- And {len(chunks) - 3} more changes."
        
        return description

    def _infer_why_changed(self, old_content: str, new_content: str, language: str) -> str:
        """Infer why the code might have changed."""
        # This would be much more powerful with a real LLM, but we can make some basic inferences
        
        if not old_content or not new_content:
            return "Without both the old and new versions, it's difficult to infer why the code changed."
        
        # Look for common patterns
        if "TODO" in old_content and "TODO" not in new_content:
            return "It appears a TODO item was addressed in this change."
            
        if "bug" in old_content.lower() and "fix" in new_content.lower():
            return "This change appears to be a bug fix."
            
        if len(new_content) > len(old_content) * 1.5:
            return "This change significantly expands the functionality with new code."
            
        if len(new_content) < len(old_content) * 0.5:
            return "This change significantly reduces code, possibly a refactoring or removal of functionality."
        
        return "Without more context, it's difficult to determine exactly why these changes were made. The modifications could be feature additions, bug fixes, refactoring, or other improvements."

    def _describe_impact(self, chunks: List[Dict[str, Any]], language: str) -> str:
        """Describe the potential impact of the changes."""
        impacts = []
        
        for chunk in chunks:
            changes = chunk.get('changes', [])
            
            # Check for specific patterns based on language
            if language == 'javascript' or language == 'typescript':
                if any('function' in change.get('content', '') for change in changes):
                    impacts.append("This change modifies function definitions, which may affect behavior.")
                if any('export' in change.get('content', '') for change in changes):
                    impacts.append("This change affects exports, which may impact module interfaces.")
                if any('import' in change.get('content', '') for change in changes):
                    impacts.append("This change affects imports, which may change dependencies.")
                if any('class' in change.get('content', '') for change in changes):
                    impacts.append("This change modifies class definitions, which may affect object behavior.")
                
            elif language == 'python':
                if any('def ' in change.get('content', '') for change in changes):
                    impacts.append("This change modifies function definitions, which may affect behavior.")
                if any('class ' in change.get('content', '') for change in changes):
                    impacts.append("This change modifies class definitions, which may affect object behavior.")
                if any('import ' in change.get('content', '') for change in changes):
                    impacts.append("This change affects imports, which may change dependencies.")
        
        if not impacts:
            return "These changes appear to be minor and likely won't have significant impact on the application's behavior."
            
        # Remove duplicates while preserving order
        unique_impacts = []
        for impact in impacts:
            if impact not in unique_impacts:
                unique_impacts.append(impact)
        
        return "\\n".join(unique_impacts)

    def _count_changed_lines(self, chunks: List[Dict[str, Any]]) -> str:
        """Count the number of changed lines."""
        added = 0
        removed = 0
        for chunk in chunks:
            for change in chunk.get('changes', []):
                if change.get('type') == 'add':
                    added += 1
                elif change.get('type') == 'delete':
                    removed += 1
        
        return f"There are {added} lines added and {removed} lines removed in this change."
`;
    }

    /**
     * Get requirements.txt content
     */
    private getRequirementsContent(): string {
        return `flask==2.0.1
difflib-sequence-matcher==1.0
`;
    }
}