import { FileDiff, FileStatus, DiffChunk, DiffChange, ChangeType } from '../models/gitTypes';

/**
 * Parse Git diff output into structured format
 */
export function parseGitDiff(diffOutput: string): FileDiff[] {
  const results: FileDiff[] = [];
  let currentFile: Partial<FileDiff> | null = null;
  let currentChunk: Partial<DiffChunk> | null = null;
  
  // Split the diff output into lines
  const lines = diffOutput.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // File header: "diff --git a/file1.txt b/file2.txt"
    if (line.startsWith('diff --git')) {
      // Save previous file if exists
      if (currentFile && currentFile.chunks) {
        results.push(currentFile as FileDiff);
      }
      
      // Start a new file
      currentFile = {
        oldPath: '',
        newPath: '',
        status: FileStatus.MODIFIED,
        isBinary: false,
        chunks: []
      };
      currentChunk = null;
      
      // Binary file check
      const binaryCheck = lines.slice(i, i + 3).find(l => l.includes('Binary files'));
      if (binaryCheck) {
        currentFile.isBinary = true;
        // Extract file paths from binary file line
        const match = binaryCheck.match(/Binary files a\/(.*) and b\/(.*) differ/);
        if (match) {
          currentFile.oldPath = match[1];
          currentFile.newPath = match[2];
        }
        i += 2; // Skip binary file lines
        continue;
      }
    }
    
    // File paths: "--- a/file1.txt" and "+++ b/file2.txt"
    else if (line.startsWith('--- a/') && currentFile) {
      currentFile.oldPath = line.substring(6);
    }
    else if (line.startsWith('+++ b/') && currentFile) {
      currentFile.newPath = line.substring(6);
      
      // Check if this is a new file or deleted file
      if (currentFile.oldPath === '/dev/null') {
        currentFile.status = FileStatus.ADDED;
        currentFile.oldPath = currentFile.newPath;
      } else if (currentFile.newPath === '/dev/null') {
        currentFile.status = FileStatus.DELETED;
        currentFile.newPath = currentFile.oldPath;
      }
    }
    
    // Chunk header: "@@ -1,5 +2,5 @@"
    else if (line.startsWith('@@') && currentFile) {
      // Save previous chunk if exists
      if (currentChunk && currentChunk.changes) {
        currentFile.chunks = currentFile.chunks || [];
        currentFile.chunks.push(currentChunk as DiffChunk);
      }
      
      // Parse chunk header
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      
      if (match) {
        const [_, oldStart, oldLines, newStart, newLines] = match.map(v => parseInt(v || '1', 10));
        
        currentChunk = {
          oldStart,
          oldLines: oldLines || 0,
          newStart,
          newLines: newLines || 0,
          changes: []
        };
      } else {
        // Malformed chunk header
        currentChunk = null;
      }
    }
    
    // Content lines
    else if (currentChunk && currentFile && !currentFile.isBinary) {
      // Ensure changes array exists
      currentChunk.changes = currentChunk.changes || [];
      
      if (line.startsWith('+')) {
        // Added line
        currentChunk.changes.push({
          type: ChangeType.ADD,
          content: line.substring(1)
        });
      } else if (line.startsWith('-')) {
        // Deleted line
        currentChunk.changes.push({
          type: ChangeType.DELETE,
          content: line.substring(1)
        });
      } else if (line.startsWith(' ')) {
        // Unchanged line
        currentChunk.changes.push({
          type: ChangeType.NORMAL,
          content: line.substring(1)
        });
      }
      // Ignore other lines (like "No newline at end of file")
    }
  }
  
  // Add the last file and chunk if they exist
  if (currentFile) {
    if (currentChunk && currentChunk.changes) {
      currentFile.chunks = currentFile.chunks || [];
      currentFile.chunks.push(currentChunk as DiffChunk);
    }
    results.push(currentFile as FileDiff);
  }
  
  return results;
}