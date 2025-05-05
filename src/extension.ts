import * as vscode from 'vscode';
import { GitService } from './services/gitService';
import { AIService } from './services/aiService';
import { DiffViewProvider } from './providers/diffViewProvider';
import { AnalysisViewProvider } from './providers/analysisViewProvider';
import { registerCommands } from './commands';
import { ExtensionState } from './models/extensionState';

export async function activate(context: vscode.ExtensionContext) {
  console.log('IntelliDiff extension is now active');

  // Initialize services
  const gitService = new GitService();
  const aiService = new AIService();
  
  // Create extension state
  const extensionState = new ExtensionState();
  
  // Initialize view providers
  const diffViewProvider = new DiffViewProvider(context.extensionUri, gitService);
  const analysisViewProvider = new AnalysisViewProvider(context.extensionUri, gitService, aiService);
  
  // Register webview providers
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'intellidiffExplorer',
      diffViewProvider
    )
  );
  
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'intellidiffAnalysis',
      analysisViewProvider
    )
  );

  // Register commands
  registerCommands(context, gitService, aiService, diffViewProvider, analysisViewProvider, extensionState);
  
  // Show welcome message on first activation
  const hasShownWelcome = context.globalState.get('intellidiff.hasShownWelcome');
  if (!hasShownWelcome) {
    vscode.window.showInformationMessage('Welcome to IntelliDiff! Try comparing Git versions or analyzing changes.');
    context.globalState.update('intellidiff.hasShownWelcome', true);
  }
}

export function deactivate() {
  console.log('IntelliDiff extension has been deactivated');
}