const VALID_STANDARDS = new Set([
  "Engineering Research",
  "Multimethodology or mixed methods",
  "Action Research",
  "Case Study",
  "Grounded Theory",
  "Qualitative Survey",
  "Benchmarking",
  "Data Science",
  "Experiment with human participants",
  "Optimization Study",
  "Quantitative Longitudinal Study",
  "Quantitative Simulation",
  "Questionnaire Survey",
  "Repository Mining",
  "Case Survey",
  "Systematic Literature Review",
  "Meta Science",
  "Replication",
  "Empirical Method Not Listed Above",
]);

export class ChecklistService {
  static filterValidStandards(
    standards: Array<{ label: string; confidence: string; evidence: string }>
  ): Array<{ label: string; confidence: 'high' | 'medium' | 'low' | string; evidence: string }> {
    const filtered = standards.filter((s) => {
      if (!VALID_STANDARDS.has(s.label)) {
        console.warn(`[ChecklistService] Dropping invalid standard: ${s.label}`);
        return false;
      }
      return true;
    });
    return filtered;
  }

  static buildEmpiricalStandardsUrl(standards: string[], role = "author"): string {
    const base = "https://www2.sigsoft.org/EmpiricalStandards/form_generator/result.html";
    const params = new URLSearchParams();
    for (const standard of standards) {
      params.append("standard", standard);
    }
    params.append("role", role);
    return `${base}?${params.toString()}`;
  }
}
