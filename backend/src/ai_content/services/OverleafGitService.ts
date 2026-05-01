import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { LatexCompilerService } from './LatexCompilerService';

const execAsync = promisify(exec);

export class OverleafGitService {
  /**
   * Clones an Overleaf project into a temporary directory using the Coordinator's global token.
   * @param gitUrl The Overleaf Git URL provided by the author.
   * @param token The global Coordinator token.
   * @returns The path to the cloned temporary directory.
   */
  static async cloneProject(gitUrl: string, token: string): Promise<string> {
    // Determine a safe temp directory name based on timestamp
    const tempDir = path.join(process.cwd(), 'temp_clone_' + Date.now());
    
    // In a real implementation, we would construct an authenticated URL:
    // https://x-token-auth:${token}@git.overleaf.com/123456789
    // For now, this is a stub.
    console.log(`[OverleafGitService] Cloning ${gitUrl} to ${tempDir}`);
    
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Stub: simulate cloning delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Stub: create a dummy main.tex so compilation doesn't fail
    fs.writeFileSync(path.join(tempDir, 'main.tex'), '\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}\n');
    
    // In actual implementation:
    // await execAsync(`git clone https://x-token-auth:${token}@${cleanUrl} ${tempDir}`);
    
    return tempDir;
  }

  /**
   * Cleans up the temporary cloned directory after processing.
   */
  static async cleanup(tempDir: string): Promise<void> {
    console.log(`[OverleafGitService] Cleaning up directory: ${tempDir}`);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Compiles the LaTeX files inside the directory to PDF.
   * Auto-injects \usepackage{todonotes} if not present in the main file.
   */
  static async compileToPdf(tempDir: string): Promise<string> {
    console.log(`[OverleafGitService] Compiling LaTeX to PDF in: ${tempDir}`);
    
    // 1. Find the main .tex file (contains \documentclass)
    const files = this.readAllTexFiles(tempDir);
    let mainFile = null;
    
    for (const f of files) {
      if (f.content.includes('\\documentclass')) {
        mainFile = f;
        break;
      }
    }

    if (!mainFile) {
      throw new Error("Could not find a main .tex file (containing \\documentclass). Cannot compile.");
    }

    // 2. Inject todonotes dependency if missing
    if (!mainFile.content.includes('{todonotes}')) {
      console.log(`[OverleafGitService] Injecting \\usepackage{todonotes} into ${mainFile.filename}`);
      const documentBeginIndex = mainFile.content.indexOf('\\begin{document}');
      if (documentBeginIndex !== -1) {
        const injectedContent = 
          mainFile.content.substring(0, documentBeginIndex) +
          '\\usepackage{todonotes}\n' +
          mainFile.content.substring(documentBeginIndex);
        fs.writeFileSync(mainFile.fullPath, injectedContent);
      }
    }

    // 3. Delegate to the portable LatexCompilerService
    return await LatexCompilerService.compile(mainFile.fullPath);
  }

  /**
   * Recursively reads all .tex files in the directory.
   */
  static readAllTexFiles(
    dir: string, 
    fileList: { filename: string; content: string; fullPath: string }[] = [],
    baseDir: string = dir
  ): { filename: string; content: string; fullPath: string }[] {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        if (file === '.git') continue; // Skip git dir
        this.readAllTexFiles(fullPath, fileList, baseDir);
      } else if (file.endsWith('.tex')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        // We use relative path as filename so AI knows nested structures
        const relativePath = path.relative(baseDir, fullPath);
        fileList.push({ filename: relativePath, content, fullPath });
      }
    }
    
    return fileList;
  }

  /**
   * Zips the directory and returns the absolute path to the generated zip file.
   */
  static async archiveProject(sourceDir: string, zipFilename: string): Promise<string> {
    console.log(`[OverleafGitService] Zipping project from ${sourceDir}`);
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    
    // Add all files from sourceDir to the root of the zip
    zip.addLocalFolder(sourceDir);

    // Save to a public downloads folder (stubbed path)
    const downloadsDir = path.join(process.cwd(), 'public', 'downloads');
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }
    
    const zipPath = path.join(downloadsDir, zipFilename);
    zip.writeZip(zipPath);
    console.log(`[OverleafGitService] Zip created at ${zipPath}`);
    
    return zipPath;
  }
}
