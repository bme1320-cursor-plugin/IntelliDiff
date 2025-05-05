import * as vscode from 'vscode';
import { GitService } from '../services/gitService';
import { AIService } from '../services/aiService';
import { DiffViewProvider } from '../providers/diffViewProvider';
import { AnalysisViewProvider } from '../providers/analysisViewProvider';
import { ExtensionState } from '../models/extensionState';
import { GitReference, GitReferenceType } from '../models/gitTypes';

/**
 * Register all extension commands
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  gitService: GitService,
  aiService: AIService,
  diffViewProvider: DiffViewProvider,
  analysisViewProvider: AnalysisViewProvider,
  extensionState: ExtensionState
): void {
  // Command to compare Git versions
  const compareDiffCommand = vscode.commands.registerCommand('intellidiff.compareDiff', async () => {
    try {
      if (!gitService.isGitAvailable()) {
        vscode.window.showErrorMessage('Git is not available in the current workspace');
        return;
      }
      
      // Get Git references
      const baseRef = await selectGitReference('Select base reference', gitService);
      if (!baseRef) {
        return;
      }
      
      const compareRef = await selectGitReference('Select compare reference', gitService);
      if (!compareRef) {
        return;
      }
      
      // Update extension state
      extensionState.baseRef = baseRef;
      extensionState.compareRef = compareRef;
      extensionState.isComparing = true;
      
      // Compare references and show diff view
      vscode.window.showInformationMessage(`Comparing ${baseRef.name} with ${compareRef.name}`);
      
      // Load the diff view
      await diffViewProvider.loadDiffView(baseRef, compareRef);
      
      // Focus the view
      vscode.commands.executeCommand('intellidiffExplorer.focus');
      
      extensionState.isComparing = false;
    } catch (error) {
      extensionState.isComparing = false;
      console.error('Error in compareDiff command:', error);
      vscode.window.showErrorMessage(`Error comparing Git versions: ${error}`);
    }
  });
  
  // Command to analyze current changes with AI
  const analyzeChangesCommand = vscode.commands.registerCommand('intellidiff.analyzeChanges', async () => {
    try {
      if (!gitService.isGitAvailable()) {
        vscode.window.showErrorMessage('Git is not available in the current workspace');
        return;
      }
      
      if (!extensionState.baseRef || !extensionState.compareRef) {
        vscode.window.showInformationMessage('Please compare Git versions first');
        await vscode.commands.executeCommand('intellidiff.compareDiff');
        return;
      }
      
      if (!extensionState.currentFile) {
        vscode.window.showInformationMessage('Please select a file to analyze');
        return;
      }
      
      extensionState.isAnalyzing = true;
      vscode.window.showInformationMessage(`Analyzing changes in ${extensionState.currentFile}`);
      
      // Load analysis view
      await analysisViewProvider.analyzeFile(
        extensionState.baseRef,
        extensionState.compareRef,
        extensionState.currentFile
      );
      
      // Focus the view
      vscode.commands.executeCommand('intellidiffAnalysis.focus');
      
      extensionState.isAnalyzing = false;
    } catch (error) {
      extensionState.isAnalyzing = false;
      console.error('Error in analyzeChanges command:', error);
      vscode.window.showErrorMessage(`Error analyzing changes: ${error}`);
    }
  });
  
  // Command to select a file for analysis
  const selectFileCommand = vscode.commands.registerCommand('intellidiff.selectFile', async (filePath: string) => {
    if (!filePath) {
      return;
    }
    
    extensionState.currentFile = filePath;
    vscode.window.showInformationMessage(`Selected file: ${filePath}`);
    
    // Automatically show analysis
    await vscode.commands.executeCommand('intellidiff.analyzeChanges');
  });
  
  // Command to ask a question about changes
  const askQuestionCommand = vscode.commands.registerCommand('intellidiff.askQuestion', async () => {
    if (!extensionState.baseRef || !extensionState.compareRef || !extensionState.currentFile) {
      vscode.window.showInformationMessage('Please select a file to analyze first');
      return;
    }
    
    const question = await vscode.window.showInputBox({
      prompt: 'Ask a question about the changes',
      placeHolder: 'E.g., "What changed in this file?" or "Why was this code changed?"'
    });
    
    if (!question) {
      return;
    }
    
    try {
      vscode.window.showInformationMessage('Analyzing your question...');
      await analysisViewProvider.askQuestion(question);
    } catch (error) {
      console.error('Error asking question:', error);
      vscode.window.showErrorMessage(`Error analyzing question: ${error}`);
    }
  });
  
  // Register all commands
  context.subscriptions.push(
    compareDiffCommand,
    analyzeChangesCommand,
    selectFileCommand,
    askQuestionCommand
  );
}

/**
 * Helper to select a Git reference
 */
async function selectGitReference(
  title: string,
  gitService: GitService
): Promise<GitReference | undefined> {
  try {
    // First, select the type of reference
    const refTypeOptions = [
      { label: 'Branch', type: GitReferenceType.BRANCH },
      { label: 'Tag', type: GitReferenceType.TAG },
      { label: 'Commit', type: GitReferenceType.COMMIT },
      { label: 'Working Tree', type: GitReferenceType.WORKING_TREE }
    ];
    
    const selectedType = await vscode.window.showQuickPick(refTypeOptions, {
      placeHolder: 'Select reference type',
      title
    });
    
    if (!selectedType) {
      return undefined;
    }
    
    // Then, based on the type, select the specific reference
    switch (selectedType.type) {
      case GitReferenceType.BRANCH: {
        const branches = await gitService.getBranches();
        const branchItems = branches.map(branch => ({ label: branch }));
        
        const selectedBranch = await vscode.window.showQuickPick(branchItems, {
          placeHolder: 'Select branch',
          title
        });
        
        if (!selectedBranch) {
          return undefined;
        }
        
        return {
          type: GitReferenceType.BRANCH,
          name: selectedBranch.label
        };
      }
      
      case GitReferenceType.TAG: {
        const tags = await gitService.getTags();
        const tagItems = tags.map(tag => ({ label: tag }));
        
        const selectedTag = await vscode.window.showQuickPick(tagItems, {
          placeHolder: 'Select tag',
          title
        });
        
        if (!selectedTag) {
          return undefined;
        }
        
        return {
          type: GitReferenceType.TAG,
          name: selectedTag.label
        };
      }
      
      case GitReferenceType.COMMIT: {
        const commits = await gitService.getCommits(50);
        const commitItems = commits.map(commit => ({
          label: commit.shortHash,
          description: commit.message,
          detail: `${commit.author}, ${commit.date.toLocaleString()}`
        }));
        
        const selectedCommit = await vscode.window.showQuickPick(commitItems, {
          placeHolder: 'Select commit',
          title
        });
        
        if (!selectedCommit) {
          return undefined;
        }
        
        const commit = commits.find(c => c.shortHash === selectedCommit.label);
        
        if (!commit) {
          return undefined;
        }
        
        return {
          type: GitReferenceType.COMMIT,
          name: commit.shortHash,
          id: commit.hash
        };
      }
      
      case GitReferenceType.WORKING_TREE:
        return {
          type: GitReferenceType.WORKING_TREE,
          name: 'Working Tree'
        };
      
      default:
        return undefined;
    }
  } catch (error) {
    console.error('Error selecting Git reference:', error);
    vscode.window.showErrorMessage(`Error selecting Git reference: ${error}`);
    return undefined;
  }
}