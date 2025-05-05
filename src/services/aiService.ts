import axios from 'axios';
import * as vscode from 'vscode';
import { FileDiff, DiffAnalysis, ChangeAnalysis } from '../models/gitTypes';
import { PythonService } from './pythonService';

export class AIService {
  private pythonService: PythonService;
  private isServerReady: boolean = false;

  constructor() {
    this.pythonService = new PythonService();
    this.initPythonServer();
  }

  /**
   * Initialize the Python server for AI processing
   */
  private async initPythonServer(): Promise<void> {
    try {
      await this.pythonService.startServer();
      this.isServerReady = true;
      console.log('Python AI server started successfully');
    } catch (error) {
      console.error('Failed to start Python AI server:', error);
      vscode.window.showErrorMessage('Failed to initialize AI analysis capabilities');
    }
  }

  /**
   * Analyze code changes in a file diff
   */
  public async analyzeFileDiff(fileDiff: FileDiff): Promise<DiffAnalysis> {
    if (!this.isServerReady) {
      try {
        await this.initPythonServer();
      } catch (error) {
        throw new Error('AI analysis server is not available');
      }
    }

    try {
      // Prepare data for analysis
      const analysisData = {
        filePath: fileDiff.newPath,
        oldContent: fileDiff.oldContent || '',
        newContent: fileDiff.newContent || '',
        chunks: fileDiff.chunks
      };

      // Send data to Python server for analysis
      const response = await axios.post('http://localhost:5000/analyze', analysisData, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      });

      if (response.status !== 200) {
        throw new Error(`AI analysis failed with status: ${response.status}`);
      }

      return response.data;
    } catch (error) {
      console.error('Error during AI analysis:', error);
      
      // Return a basic analysis if the AI service fails
      return this.fallbackAnalysis(fileDiff);
    }
  }

  /**
   * Ask a specific question about code changes
   */
  public async askQuestion(
    fileDiff: FileDiff, 
    question: string
  ): Promise<string> {
    if (!this.isServerReady) {
      try {
        await this.initPythonServer();
      } catch (error) {
        throw new Error('AI analysis server is not available');
      }
    }

    try {
      // Prepare data for question
      const questionData = {
        filePath: fileDiff.newPath,
        oldContent: fileDiff.oldContent || '',
        newContent: fileDiff.newContent || '',
        chunks: fileDiff.chunks,
        question: question
      };

      // Send question to Python server
      const response = await axios.post('http://localhost:5000/ask', questionData, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      });

      if (response.status !== 200) {
        throw new Error(`AI question failed with status: ${response.status}`);
      }

      return response.data.answer;
    } catch (error) {
      console.error('Error asking AI a question:', error);
      return 'Sorry, I was unable to analyze this code change. Please try again later.';
    }
  }

  /**
   * Provide a basic analysis in case the AI service fails
   */
  private fallbackAnalysis(fileDiff: FileDiff): DiffAnalysis {
    const changes: ChangeAnalysis[] = [];
    
    // Create simple change analysis for each chunk
    fileDiff.chunks.forEach((chunk, index) => {
      changes.push({
        startLine: chunk.newStart,
        endLine: chunk.newStart + chunk.newLines - 1,
        description: `Code block ${index + 1} was modified with ${chunk.changes.length} line changes.`
      });
    });
    
    return {
      filePath: fileDiff.newPath,
      summary: `This file has ${fileDiff.chunks.length} changed sections.`,
      changes,
      potentialIssues: [],
      suggestions: []
    };
  }

  /**
   * Stop the Python server when extension is deactivated
   */
  public async dispose(): Promise<void> {
    if (this.isServerReady) {
      await this.pythonService.stopServer();
      this.isServerReady = false;
    }
  }
}