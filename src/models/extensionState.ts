import { GitCommit, GitReference } from './gitTypes';

/**
 * Manages the current state of the extension
 */
export class ExtensionState {
  // Current selected references for comparison
  private _baseRef?: GitReference;
  private _compareRef?: GitReference;
  
  // Lists of available references
  private _branches: string[] = [];
  private _tags: string[] = [];
  private _commits: GitCommit[] = [];
  
  // Current file being analyzed
  private _currentFile?: string;
  
  // Analysis results cache
  private _analysisResults: Map<string, string> = new Map();
  
  // Comparison is in progress
  private _isComparing: boolean = false;
  
  // Analysis is in progress
  private _isAnalyzing: boolean = false;

  // Getters
  get baseRef(): GitReference | undefined {
    return this._baseRef;
  }
  
  get compareRef(): GitReference | undefined {
    return this._compareRef;
  }
  
  get branches(): string[] {
    return this._branches;
  }
  
  get tags(): string[] {
    return this._tags;
  }
  
  get commits(): GitCommit[] {
    return this._commits;
  }
  
  get currentFile(): string | undefined {
    return this._currentFile;
  }
  
  get isComparing(): boolean {
    return this._isComparing;
  }
  
  get isAnalyzing(): boolean {
    return this._isAnalyzing;
  }
  
  // Setters
  set baseRef(ref: GitReference | undefined) {
    this._baseRef = ref;
  }
  
  set compareRef(ref: GitReference | undefined) {
    this._compareRef = ref;
  }
  
  set branches(branches: string[]) {
    this._branches = branches;
  }
  
  set tags(tags: string[]) {
    this._tags = tags;
  }
  
  set commits(commits: GitCommit[]) {
    this._commits = commits;
  }
  
  set currentFile(file: string | undefined) {
    this._currentFile = file;
  }
  
  set isComparing(comparing: boolean) {
    this._isComparing = comparing;
  }
  
  set isAnalyzing(analyzing: boolean) {
    this._isAnalyzing = analyzing;
  }
  
  // Methods to manage analysis results
  getAnalysisResult(key: string): string | undefined {
    return this._analysisResults.get(key);
  }
  
  setAnalysisResult(key: string, result: string): void {
    this._analysisResults.set(key, result);
  }
  
  clearAnalysisResults(): void {
    this._analysisResults.clear();
  }
  
  // Reset the state
  reset(): void {
    this._baseRef = undefined;
    this._compareRef = undefined;
    this._currentFile = undefined;
    this._isComparing = false;
    this._isAnalyzing = false;
    this.clearAnalysisResults();
  }
}