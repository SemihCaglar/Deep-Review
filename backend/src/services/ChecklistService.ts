import { AzureOpenAIClient } from '../utils/AzureOpenAIClient';

export class ChecklistService {
  /**
   * Generates the empty SIGSOFT checklist structure for a specific paper type.
   */
  static generateChecklistForType(paperType: string): any[] {
    console.log(`[ChecklistService] Generating SIGSOFT checklist for type: ${paperType}`);
    // Stub: Returns an array of checklist items
    return [
      { id: 'item1', question: 'Are the research questions clearly stated?', answer: null },
      { id: 'item2', question: 'Is the methodology appropriate?', answer: null },
      { id: 'item3', question: 'Are threats to validity discussed?', answer: null }
    ];
  }

  /**
   * AI pre-fills the checklist items based on the paper content.
   */
  static async preFillChecklist(checklist: any[], paperContent: string): Promise<any[]> {
    console.log(`[ChecklistService] AI pre-filling checklist items.`);
    
    // Construct a prompt asking the AI to evaluate each checklist item
    const systemMessage = "You are an expert academic reviewer. Given the paper content, evaluate the following checklist items and provide your best assessment. Respond in JSON format mapping item IDs to your predicted boolean answer (true/false).";
    
    const checklistQuestions = checklist.map(item => `- ${item.id}: ${item.question}`).join('\n');
    const userMessage = `Paper Content:\n${paperContent.substring(0, 5000)}...\n\nChecklist to evaluate:\n${checklistQuestions}\n\nPlease output JSON only: { "item1": true, "item2": false, ... }`;

    let aiResponses: Record<string, boolean> = {};
    try {
      const responseText = await AzureOpenAIClient.sendPrompt(systemMessage, userMessage);
      // Clean up markdown code blocks if AI wrapped the JSON
      const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      aiResponses = JSON.parse(cleanedText);
    } catch (err) {
      console.warn("[ChecklistService] Failed to parse AI JSON response or API error, falling back to defaults.", err);
    }

    const filledChecklist = checklist.map(item => ({
      ...item,
      answer: aiResponses[item.id] !== undefined ? aiResponses[item.id] : null,
      aiConfidence: aiResponses[item.id] !== undefined ? 0.95 : 0.0
    }));
    
    return filledChecklist;
  }
}
