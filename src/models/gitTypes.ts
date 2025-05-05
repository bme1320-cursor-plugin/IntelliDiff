/**
 * Types of Git references that can be compared
 */
export enum GitReferenceType {
  COMMIT = 'commit',
  BRANCH = 'branch',
  TAG = 'tag',
  WORKING_TREE = 'working_tree',
  STAGED = 'staged'
}

/**
 * Represents a Git reference for comparison
 */
export interface GitReference {
  type: GitReferenceType;
  name: string;
  id?: string;
}

/**
 * Represents a Git commit
 */
export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  date: Date;
  message: string;
}

/**
 * Status of a file in diff
 */
export enum FileStatus {
  ADDED = 'added',
  MODIFIED = 'modified',
  DELETED = 'deleted',
  RENAMED = 'renamed',
  BINARY = 'binary'
}

/**
 * Represents a file in the diff result
 */
export interface DiffFile {
  oldPath: string;
  newPath: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  isBinary: boolean;
}

/**
 * A chunk of changes in a diff
 */
export interface DiffChunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: DiffChange[];
}

/**
 * Types of changes in a diff
 */
export enum ChangeType {
  ADD = 'add',
  DELETE = 'delete',
  NORMAL = 'normal'
}

/**
 * A single line change in a diff
 */
export interface DiffChange {
  type: ChangeType;
  content: string;
  lineNumber?: number;
}

/**
 * Complete diff between two files
 */
export interface FileDiff {
  oldPath: string;
  newPath: string;
  status: FileStatus;
  isBinary: boolean;
  chunks: DiffChunk[];
  oldContent?: string;
  newContent?: string;
}

/**
 * AI analysis result for a file diff
 */
export interface DiffAnalysis {
  filePath: string;
  summary: string;
  changes: ChangeAnalysis[];
  potentialIssues?: string[];
  suggestions?: string[];
}

/**
 * AI analysis for a specific change
 */
export interface ChangeAnalysis {
  startLine: number;
  endLine: number;
  description: string;
  impact?: string;
  codeContext?: string;
}