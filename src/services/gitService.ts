import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import * as path from 'path';
import simpleGit, { SimpleGit } from 'simple-git';
import { 
  GitCommit, 
  GitReference, 
  GitReferenceType, 
  DiffFile, 
  FileDiff, 
  FileStatus,
  DiffChunk
} from '../models/gitTypes';
import { parseGitDiff } from '../utils/diffParser';

export class GitService {
  private git: SimpleGit | null = null;
  
  constructor() {
    this.initGit();
  }
  
  private async initGit(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('No workspace folder is open');
      return;
    }
    
    const rootPath = workspaceFolders[0].uri.fsPath;
    try {
      this.git = simpleGit(rootPath);
      const isRepo = await this.git.checkIsRepo();
      
      if (!isRepo) {
        vscode.window.showWarningMessage('Current workspace is not a Git repository');
        this.git = null;
      }
    } catch (error) {
      console.error('Failed to initialize Git:', error);
      vscode.window.showErrorMessage('Failed to initialize Git');
      this.git = null;
    }
  }
  
  /**
   * Check if Git is available
   */
  public isGitAvailable(): boolean {
    return this.git !== null;
  }
  
  /**
   * Get all branches in the repository
   */
  public async getBranches(): Promise<string[]> {
    if (!this.git) {
      throw new Error('Git is not initialized');
    }
    
    try {
      const result = await this.git.branch();
      return result.all;
    } catch (error) {
      console.error('Failed to get branches:', error);
      throw new Error('Failed to get branches');
    }
  }
  
  /**
   * Get all tags in the repository
   */
  public async getTags(): Promise<string[]> {
    if (!this.git) {
      throw new Error('Git is not initialized');
    }
    
    try {
      const result = await this.git.tag(['--list']);
      return result.split('\n').filter(Boolean);
    } catch (error) {
      console.error('Failed to get tags:', error);
      throw new Error('Failed to get tags');
    }
  }
  
  /**
   * Get recent commits
   */
  public async getCommits(limit: number = 50): Promise<GitCommit[]> {
    if (!this.git) {
      throw new Error('Git is not initialized');
    }
    
    try {
      const result = await this.git.log({
        maxCount: limit
      });
      
      return result.all.map(commit => ({
        hash: commit.hash,
        shortHash: commit.hash.substring(0, 7),
        author: commit.author_name,
        date: new Date(commit.date),
        message: commit.message
      }));
    } catch (error) {
      console.error('Failed to get commits:', error);
      throw new Error('Failed to get commits');
    }
  }
  
  /**
   * Compare two Git references and return list of changed files
   */
  public async compareRefs(baseRef: GitReference, compareRef: GitReference): Promise<DiffFile[]> {
    if (!this.git) {
      throw new Error('Git is not initialized');
    }
    
    try {
      let baseRefStr = this.getRefString(baseRef);
      let compareRefStr = this.getRefString(compareRef);
      
      // Get raw diff output
      const diffOutput = await this.git.diff([
        '--name-status',
        baseRefStr,
        compareRefStr
      ]);
      
      // Parse diff output and get list of files
      const files: DiffFile[] = [];
      const lines = diffOutput.split('\n').filter(Boolean);
      
      for (const line of lines) {
        const [status, ...paths] = line.split('\t');
        
        // Handle renamed files (path1 -> path2)
        if (status.startsWith('R')) {
          files.push({
            oldPath: paths[0],
            newPath: paths[1],
            status: FileStatus.RENAMED,
            additions: 0,
            deletions: 0,
            isBinary: false
          });
        } else {
          const filePath = paths[0];
          files.push({
            oldPath: filePath,
            newPath: filePath,
            status: this.mapGitStatusToFileStatus(status),
            additions: 0,
            deletions: 0,
            isBinary: false
          });
        }
      }
      
      // Check for binary files and get addition/deletion stats
      const statOutput = await this.git.diff([
        '--numstat',
        baseRefStr,
        compareRefStr
      ]);
      
      const statLines = statOutput.split('\n').filter(Boolean);
      
      for (const statLine of statLines) {
        const [additions, deletions, filePath] = statLine.split('\t');
        
        // Find the file in our list
        const file = files.find(f => 
          f.newPath === filePath || 
          f.oldPath === filePath
        );
        
        if (file) {
          // Binary files are represented with '-' in numstat
          if (additions === '-' && deletions === '-') {
            file.isBinary = true;
          } else {
            file.additions = parseInt(additions, 10);
            file.deletions = parseInt(deletions, 10);
          }
        }
      }
      
      return files;
    } catch (error) {
      console.error('Failed to compare refs:', error);
      throw new Error('Failed to compare Git references');
    }
  }
  
  /**
   * Get detailed diff for a specific file between two refs
   */
  public async getFileDiff(
    baseRef: GitReference, 
    compareRef: GitReference, 
    filePath: string
  ): Promise<FileDiff> {
    if (!this.git) {
      throw new Error('Git is not initialized');
    }
    
    try {
      const baseRefStr = this.getRefString(baseRef);
      const compareRefStr = this.getRefString(compareRef);
      
      // Check if file is binary
      const isBinary = await this.isFileBinary(baseRefStr, compareRefStr, filePath);
      
      if (isBinary) {
        // For binary files, we just return basic info without chunks
        return {
          oldPath: filePath,
          newPath: filePath,
          status: await this.getFileStatus(baseRefStr, compareRefStr, filePath),
          isBinary: true,
          chunks: []
        };
      }
      
      // For text files, get the full diff
      const diffOutput = await this.git.diff([
        '-U10000', // Large context to ensure we get the whole file
        baseRefStr,
        compareRefStr,
        '--',
        filePath
      ]);
      
      // Parse the diff output
      const parsedDiff = parseGitDiff(diffOutput);
      
      if (parsedDiff.length === 0) {
        throw new Error(`No diff found for file: ${filePath}`);
      }
      
      const fileDiff = parsedDiff[0];
      
      // Get the old and new content for the file
      const oldContent = await this.getFileContent(baseRef, filePath);
      const newContent = await this.getFileContent(compareRef, filePath);
      
      return {
        ...fileDiff,
        oldContent,
        newContent
      };
    } catch (error) {
      console.error(`Failed to get diff for file ${filePath}:`, error);
      throw new Error(`Failed to get diff for file: ${filePath}`);
    }
  }
  
  /**
   * Get binary file contents for both versions
   */
  public async getBinaryFilesContent(
    baseRef: GitReference,
    compareRef: GitReference,
    filePath: string
  ): Promise<{ oldContent: Buffer | null, newContent: Buffer | null }> {
    if (!this.git) {
      throw new Error('Git is not initialized');
    }
    
    try {
      const baseRefStr = this.getRefString(baseRef);
      const compareRefStr = this.getRefString(compareRef);
      const workspaceFolders = vscode.workspace.workspaceFolders;
      
      if (!workspaceFolders) {
        throw new Error('No workspace folder is open');
      }
      
      const rootPath = workspaceFolders[0].uri.fsPath;
      const tempDir = path.join(rootPath, '.intellidiff_temp');
      
      // Create temp directory if it doesn't exist
      try {
        await fs.mkdir(tempDir, { recursive: true });
      } catch (err) {
        console.log('Temp directory already exists or error creating it:', err);
      }
      
      // Files to store the content
      const oldFilePath = path.join(tempDir, 'old_' + path.basename(filePath));
      const newFilePath = path.join(tempDir, 'new_' + path.basename(filePath));
      
      let oldContent: Buffer | null = null;
      let newContent: Buffer | null = null;
      
      // Get old version content if it exists
      try {
        await this.git.show([
          `${baseRefStr}:${filePath}`,
          `--output=${oldFilePath}`
        ]);
        oldContent = await fs.readFile(oldFilePath);
      } catch (err) {
        console.log(`File ${filePath} does not exist in ${baseRefStr}`);
      }
      
      // Get new version content if it exists
      try {
        await this.git.show([
          `${compareRefStr}:${filePath}`,
          `--output=${newFilePath}`
        ]);
        newContent = await fs.readFile(newFilePath);
      } catch (err) {
        console.log(`File ${filePath} does not exist in ${compareRefStr}`);
      }
      
      // Clean up temp files
      try {
        if (oldContent) await fs.unlink(oldFilePath);
        if (newContent) await fs.unlink(newFilePath);
      } catch (err) {
        console.log('Error removing temp files:', err);
      }
      
      return { oldContent, newContent };
    } catch (error) {
      console.error(`Failed to get binary content for file ${filePath}:`, error);
      throw new Error(`Failed to get binary content for file: ${filePath}`);
    }
  }
  
  /**
   * Get the content of a file at a specific reference
   */
  private async getFileContent(ref: GitReference, filePath: string): Promise<string | undefined> {
    if (!this.git) {
      throw new Error('Git is not initialized');
    }
    
    try {
      const refStr = this.getRefString(ref);
      
      // Special case for working tree
      if (ref.type === GitReferenceType.WORKING_TREE) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
          throw new Error('No workspace folder is open');
        }
        
        const rootPath = workspaceFolders[0].uri.fsPath;
        const absolutePath = path.join(rootPath, filePath);
        
        try {
          const content = await fs.readFile(absolutePath, 'utf-8');
          return content;
        } catch (err) {
          // File might not exist in working tree
          return undefined;
        }
      }
      
      // For other refs, use git show
      try {
        const content = await this.git.show([`${refStr}:${filePath}`]);
        return content;
      } catch (err) {
        // File might not exist at this ref
        return undefined;
      }
    } catch (error) {
      console.error(`Failed to get content for file ${filePath}:`, error);
      return undefined;
    }
  }
  
  /**
   * Check if a file is binary
   */
  private async isFileBinary(
    baseRefStr: string, 
    compareRefStr: string, 
    filePath: string
  ): Promise<boolean> {
    if (!this.git) {
      throw new Error('Git is not initialized');
    }
    
    try {
      const diffOutput = await this.git.diff([
        '--numstat',
        baseRefStr,
        compareRefStr,
        '--',
        filePath
      ]);
      
      const lines = diffOutput.split('\n').filter(Boolean);
      
      for (const line of lines) {
        const [additions, deletions] = line.split('\t');
        // Binary files are represented with '-' in numstat
        if (additions === '-' && deletions === '-') {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error(`Failed to check if file ${filePath} is binary:`, error);
      return false;
    }
  }
  
  /**
   * Get the status of a file between two refs
   */
  private async getFileStatus(
    baseRefStr: string,
    compareRefStr: string,
    filePath: string
  ): Promise<FileStatus> {
    if (!this.git) {
      throw new Error('Git is not initialized');
    }
    
    try {
      const diffOutput = await this.git.diff([
        '--name-status',
        baseRefStr,
        compareRefStr,
        '--',
        filePath
      ]);
      
      const lines = diffOutput.split('\n').filter(Boolean);
      
      if (lines.length === 0) {
        return FileStatus.MODIFIED; // Default
      }
      
      const [status] = lines[0].split('\t');
      return this.mapGitStatusToFileStatus(status);
    } catch (error) {
      console.error(`Failed to get status for file ${filePath}:`, error);
      return FileStatus.MODIFIED; // Default fallback
    }
  }
  
  /**
   * Map Git status code to FileStatus enum
   */
  private mapGitStatusToFileStatus(status: string): FileStatus {
    switch (status.charAt(0)) {
      case 'A':
        return FileStatus.ADDED;
      case 'D':
        return FileStatus.DELETED;
      case 'R':
        return FileStatus.RENAMED;
      case 'M':
      default:
        return FileStatus.MODIFIED;
    }
  }
  
  /**
   * Convert GitReference to string representation for Git commands
   */
  private getRefString(ref: GitReference): string {
    switch (ref.type) {
      case GitReferenceType.COMMIT:
        return ref.id || ref.name;
      case GitReferenceType.BRANCH:
      case GitReferenceType.TAG:
        return ref.name;
      case GitReferenceType.WORKING_TREE:
        return '';
      case GitReferenceType.STAGED:
        return '--staged';
      default:
        return ref.name;
    }
  }
}