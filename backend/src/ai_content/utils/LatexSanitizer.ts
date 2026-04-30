/**
 * Utility for sanitizing AI-generated strings so they don't break LaTeX compilation.
 */
export class LatexSanitizer {
  /**
   * Escapes special LaTeX characters.
   * Characters escaped: &, %, $, #, _, {, }, ~, ^, \
   */
  static escapeLatex(text: string): string {
    if (!text) return '';
    return text
      .replace(/\\/g, '\\textbackslash{}') // Replace backslash first
      .replace(/&/g, '\\&')
      .replace(/%/g, '\\%')
      .replace(/\$/g, '\\$')
      .replace(/#/g, '\\#')
      .replace(/_/g, '\\_')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/~/g, '\\textasciitilde{}')
      .replace(/\^/g, '\\textasciicircum{}');
  }
}
