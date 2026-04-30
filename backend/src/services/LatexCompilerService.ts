import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

/**
 * Supported LaTeX compilation engines in priority order.
 * - tectonic: Modern, self-contained, downloads packages automatically. Best for deployment.
 * - docker: Runs pdflatex inside an isolated texlive container. Requires Docker on host.
 * - latexmk: Requires a full TeX Live installation on the host OS.
 */
type LatexEngine = 'tectonic' | 'docker' | 'latexmk';

const DOCKER_IMAGE = 'texlive/texlive:latest';
const COMPILATION_TIMEOUT_MS = 120_000; // 2 minutes max

export class LatexCompilerService {
  private static detectedEngine: LatexEngine | null = null;

  /**
   * Detects which LaTeX engine is available on the current system.
   * Result is cached after the first call.
   */
  static async detectEngine(): Promise<LatexEngine> {
    if (this.detectedEngine) return this.detectedEngine;

    // 1. Check for Tectonic (preferred for deployment)
    try {
      await execAsync('tectonic --version');
      console.log('[LatexCompilerService] Engine detected: tectonic');
      this.detectedEngine = 'tectonic';
      return 'tectonic';
    } catch {}

    // 2. Check for Docker
    try {
      await execAsync('docker info');
      console.log('[LatexCompilerService] Engine detected: docker (texlive image)');
      this.detectedEngine = 'docker';
      return 'docker';
    } catch {}

    // 3. Fall back to latexmk on the host OS
    try {
      await execAsync('latexmk --version');
      console.log('[LatexCompilerService] Engine detected: latexmk (host OS)');
      this.detectedEngine = 'latexmk';
      return 'latexmk';
    } catch {}

    throw new Error(
      'No LaTeX engine found. Install one of: tectonic, Docker (with texlive/texlive image), or latexmk.'
    );
  }

  /**
   * Compiles a .tex file using the best available engine.
   * @param mainTexPath Absolute path to the main .tex file.
   * @returns Absolute path to the generated PDF.
   */
  static async compile(mainTexPath: string): Promise<string> {
    const engine = await this.detectEngine();
    const workDir = path.dirname(mainTexPath);
    const mainFilename = path.basename(mainTexPath);
    const pdfFilename = mainFilename.replace('.tex', '.pdf');
    const pdfPath = path.join(workDir, pdfFilename);

    console.log(`[LatexCompilerService] Compiling "${mainFilename}" using ${engine}...`);

    try {
      if (engine === 'tectonic') {
        // Tectonic is self-contained: auto-downloads missing packages on the fly.
        // The -Z shell-escape flag supports minted/todonotes packages.
        await execAsync(
          `tectonic -Z shell-escape "${mainFilename}"`,
          { cwd: workDir, timeout: COMPILATION_TIMEOUT_MS }
        );

      } else if (engine === 'docker') {
        // Mount the temp directory into the container and compile in isolation.
        // --rm removes the container after completion.
        // -v mounts the local temp dir as /workdir inside the container.
        await execAsync(
          `docker run --rm -v "${workDir}:/workdir" -w /workdir ${DOCKER_IMAGE} latexmk -pdf -interaction=nonstopmode "${mainFilename}"`,
          { timeout: COMPILATION_TIMEOUT_MS }
        );

      } else {
        // latexmk on host OS as last resort
        await execAsync(
          `latexmk -pdf -interaction=nonstopmode "${mainFilename}"`,
          { cwd: workDir, timeout: COMPILATION_TIMEOUT_MS }
        );
      }
    } catch (err: any) {
      // LaTeX often exits non-zero even on "success" with warnings.
      // Only treat it as a real failure if no PDF was produced.
      console.warn(`[LatexCompilerService] Compiler exited with warnings:`, err.message?.slice(0, 200));
    }

    if (!fs.existsSync(pdfPath)) {
      throw new Error(
        `[LatexCompilerService] Compilation failed — no PDF produced at: ${pdfPath}.\nCheck the LaTeX source for syntax errors.`
      );
    }

    console.log(`[LatexCompilerService] PDF produced: ${pdfPath}`);
    return pdfPath;
  }
}
