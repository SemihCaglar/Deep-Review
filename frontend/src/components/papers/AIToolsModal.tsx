import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
  Cpu, Loader2, Download, ChevronDown, CheckCircle, 
  XCircle, AlertCircle, Search, ExternalLink, Edit2, X 
} from 'lucide-react';
import { 
  startAIReviewRequest, 
  runComplianceCheckRequest, 
  runReferenceVerificationRequest, 
  getEmpiricalChecklistAnswersRequest, 
  confirmChecklistSelectionRequest, 
  runEmpiricalChecklistAnsweringRequest,
  RoundWithAssignments,
  AuthorRound,
  ReferenceVerificationReport
} from '@/lib/api';

interface AIToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  round: any; // Using any for simplicity as it accepts AuthorRound, RoundWithAssignments, or PaperHistoryRound
  paperId: string;
  onRefresh: () => void;
}

export default function AIToolsModal({ isOpen, onClose, round, paperId, onRefresh }: AIToolsModalProps) {
  // --- AI Review State ---
  const aiFileRef = useRef<HTMLInputElement>(null);
  const [runningAI, setRunningAI] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiStatus, setAiStatus] = useState('');
  const [localAiResult, setLocalAiResult] = useState<any>(null);
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);

  // --- Compliance Check State ---
  const complianceFileRef = useRef<HTMLInputElement>(null);
  const [runningCompliance, setRunningCompliance] = useState(false);
  const [complianceError, setComplianceError] = useState('');
  const [localComplianceResult, setLocalComplianceResult] = useState<any>(null);
  const [complianceExpanded, setComplianceExpanded] = useState(false);

  // --- Reference Verification State ---
  const refVerifFileRef = useRef<HTMLInputElement>(null);
  const [runningRefVerif, setRunningRefVerif] = useState(false);
  const [refVerifError, setRefVerifError] = useState('');
  const [localRefVerifResult, setLocalRefVerifResult] = useState<ReferenceVerificationReport | null>(null);
  const [refVerifExpanded, setRefVerifExpanded] = useState(false);

  // --- Empirical Standards Checklist State ---
  const [confirmedStandards, setConfirmedStandards] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['General', 'Qualitative', 'Quantitative', 'Literature Review', 'Other']));
  const [finalizedChecklist, setFinalizedChecklist] = useState<any>(null);

  // --- Checklist Answering State ---
  const checklistAnswerFileRef = useRef<HTMLInputElement>(null);
  const [checklistAnswerData, setChecklistAnswerData] = useState<any>(null);
  const [isRunningChecklistAnswering, setIsRunningChecklistAnswering] = useState(false);
  const [checklistAnswerError, setChecklistAnswerError] = useState('');
  const [expandedChecklistStandards, setExpandedChecklistStandards] = useState<Set<string>>(new Set());
  const [checklistAnswerFilter, setChecklistAnswerFilter] = useState<'no' | 'unknown' | 'yes' | null>(null);

  const STANDARDS_BY_CATEGORY = {
    General: ['Engineering Research', 'Multimethodology or mixed methods'],
    Qualitative: ['Action Research', 'Case Study', 'Grounded Theory', 'Qualitative Survey'],
    Quantitative: [
      'Benchmarking', 'Data Science', 'Experiment with human participants', 
      'Optimization Study', 'Quantitative Longitudinal Study', 
      'Quantitative Simulation', 'Questionnaire Survey', 'Repository Mining'
    ],
    'Literature Review': ['Case Survey', 'Systematic Literature Review'],
    Other: ['Meta Science', 'Replication', 'Empirical Method Not Listed Above'],
  } as Record<string, string[]>;

  const AI_PHASES = [
    { at: 0,  msg: 'Uploading PDF to agent…' },
    { at: 4,  msg: 'Agent is reading the paper…' },
    { at: 12, msg: 'Analyzing content and generating feedback…' },
    { at: 22, msg: 'Annotating PDF…' },
    { at: 32, msg: 'Downloading annotated PDF…' },
    { at: 42, msg: 'Almost done…' },
  ];

  const handleAIFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setRunningAI(true);
    setAiError('');
    setAiStatus(AI_PHASES[0].msg);

    const start = Date.now();
    const ticker = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const phase = [...AI_PHASES].reverse().find(p => elapsed >= p.at);
      if (phase) setAiStatus(phase.msg);
    }, 1000);

    try {
      const res = await startAIReviewRequest(round.id, file);
      const aiReviewData = res.data?.aiReview;
      const refVerifData = res.data?.referenceVerification;
      const complianceData = res.data?.compliance;

      setLocalAiResult({
        reviewText: aiReviewData?.summaryReport,
        annotatedPdfUrl: aiReviewData?.annotatedPdfUrl,
        checklistJson: aiReviewData?.checklist,
        checklistUrl: aiReviewData?.checklistUrl,
        suggestedCitations: aiReviewData?.suggestedCitations
      });

      if (aiReviewData?.checklist?.selectedStandards) {
        const standards = new Set<string>(aiReviewData.checklist.selectedStandards.map((s: any) => s.label));
        setConfirmedStandards(standards);
      }

      if (refVerifData?.report) setLocalRefVerifResult(refVerifData.report);
      if (complianceData?.report) setLocalComplianceResult(complianceData.report);

      setAiStatus('');
      onRefresh();
    } catch (err: any) {
      setAiError(err.message || 'AI Review failed');
      setAiStatus('');
    } finally {
      clearInterval(ticker);
      setRunningAI(false);
    }
  };

  const handleComplianceFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setRunningCompliance(true);
    setComplianceError('');

    try {
      const res = await runComplianceCheckRequest(round.id, file);
      setLocalComplianceResult(res.data);
      onRefresh();
    } catch (err: any) {
      setComplianceError(err.message || 'Compliance check failed');
    } finally {
      setRunningCompliance(false);
    }
  };

  const handleRefVerifFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setRunningRefVerif(true);
    setRefVerifError('');

    try {
      const res = await runReferenceVerificationRequest(round.id, file);
      setLocalRefVerifResult(res.data);
      onRefresh();
    } catch (err: any) {
      setRefVerifError(err.message || 'Reference verification failed');
    } finally {
      setRunningRefVerif(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !round) return;
    if (round.confirmedChecklistJson?.selectedStandards) {
      setFinalizedChecklist(round.confirmedChecklistJson);
      return;
    }

    if (confirmedStandards.size === 0) {
      const checklist = localAiResult?.checklistJson || round.checklistJson;
      if (checklist?.selectedStandards) {
        const standards = new Set<string>(checklist.selectedStandards.map((s: any) => s.label));
        setConfirmedStandards(standards);
      }
    }
  }, [isOpen, round?.checklistJson, round?.confirmedChecklistJson, localAiResult, confirmedStandards.size]);

  useEffect(() => {
    if (isOpen && round?.confirmedChecklistJson?.selectedStandards) {
      getEmpiricalChecklistAnswersRequest(round.id)
        .then(res => { if (res?.data) setChecklistAnswerData(res.data); })
        .catch(() => {});
    }
  }, [isOpen, round?.id, round?.confirmedChecklistJson]);

  // Prevent scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !round) return null;

  const isLatestRound = round.status !== 'Draft'; // Assume tools can run if it's not a draft, or could rely on another prop if needed.
  
  const reviews = round.aiReviewReports || round.artifacts?.aiReviewReports || [];
  const recentReport = localAiResult || round.aiReviewReport;

  const comp = localComplianceResult || round.complianceReport;
  const refReport = localRefVerifResult ?? round.referenceVerificationReport;
  
  const checklist = localAiResult?.checklistJson || round.checklistJson;
  const aiSelectedMap = new Map<string, { label: string; confidence: string; evidence: string }>(
    checklist?.selectedStandards ? checklist.selectedStandards.map((s: any) => [s.label, s]) : []
  );

  const buildChecklistUrl = (standards: Set<string>) => {
    const base = "https://www2.sigsoft.org/EmpiricalStandards/form_generator/result.html";
    const params = new URLSearchParams();
    Array.from(standards).forEach(standard => params.append("standard", standard));
    params.append("role", "author");
    return `${base}?${params.toString()}`;
  };

  const handleConfirmChecklist = async () => {
    try {
      const selectedStandardsArray = Array.from(confirmedStandards);
      await confirmChecklistSelectionRequest(round.id, selectedStandardsArray);
      setFinalizedChecklist({
        selectedStandards: selectedStandardsArray,
        confirmedAt: new Date().toISOString(),
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to confirm checklist:', err);
      alert('Failed to confirm checklist. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal Container */}
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-slate-800/50">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-400" />
              AI Tools & Compliance
            </h2>
            <p className="text-xs text-slate-400 mt-1">Round {round.roundNumber} {round.targetVenue ? `— ${round.targetVenue}` : ''}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          
          {/* Main Actions */}
          <div className="flex flex-wrap items-center gap-3 pb-6 border-b border-white/5">
            <button
              onClick={() => aiFileRef.current?.click()}
              disabled={runningAI}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20 transition-all"
            >
              {runningAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cpu className="w-4 h-4" />}
              {runningAI ? 'Running Pipeline…' : 'Run Full AI Review Pipeline'}
            </button>
            <p className="text-xs text-slate-400">Includes AI Review, Compliance Check, and Reference Verification</p>
            {aiStatus && (
              <span className="text-sm font-medium text-indigo-300 animate-pulse ml-2">{aiStatus}</span>
            )}
            {aiError && <p className="text-sm text-red-400 font-medium ml-2">{aiError}</p>}
          </div>

          {/* AI Review History */}
          {(reviews.length > 0 || recentReport) && (
            <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 space-y-3">
              <p className="text-sm font-bold text-indigo-400 uppercase tracking-wider">AI Review Results</p>
              
              <div className="space-y-3">
                {reviews.length > 0 ? reviews.map((review: any, idx: number) => (
                  <div key={review.id} className="rounded-lg bg-slate-800/50 overflow-hidden border border-slate-700/50">
                    <div className="w-full flex items-center justify-between px-3 py-2.5">
                      <button
                        onClick={() => setExpandedReviewId(expandedReviewId === review.id ? null : review.id)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                      >
                        <span className="text-sm font-medium text-slate-300">Review #{reviews.length - idx}</span>
                        <span className="text-xs text-slate-500">{new Date(review.createdAt).toLocaleString()}</span>
                      </button>
                      <div className="flex items-center gap-2 shrink-0">
                        {review.annotatedPdfUrl && (
                          <a
                            href={review.annotatedPdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors"
                          >
                            <Download className="w-3 h-3" /> PDF
                          </a>
                        )}
                        <button
                          onClick={() => setExpandedReviewId(expandedReviewId === review.id ? null : review.id)}
                        >
                          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedReviewId === review.id ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {expandedReviewId === review.id && (
                      <div className="px-4 py-3 border-t border-slate-700/50 bg-slate-900/50 space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar">
                        <div className="text-sm text-slate-300 leading-relaxed markdown-content whitespace-pre-wrap">
                          <ReactMarkdown
                            components={{
                              h1: ({node, ...props}) => <h1 className="text-base font-bold text-slate-100 mt-4 mb-2" {...props} />,
                              h2: ({node, ...props}) => <h2 className="text-sm font-bold text-slate-100 mt-3 mb-2" {...props} />,
                              h3: ({node, ...props}) => <h3 className="text-sm font-semibold text-slate-100 mt-2 mb-1" {...props} />,
                              h4: ({node, ...props}) => <h4 className="text-xs font-semibold text-slate-200 mt-1 mb-1" {...props} />,
                              p: ({node, ...props}) => <p className="text-sm text-slate-300 mb-2 leading-relaxed" {...props} />,
                              ul: ({node, ...props}) => <ul className="text-sm text-slate-300 list-disc list-inside mb-2" {...props} />,
                              ol: ({node, ...props}) => <ol className="text-sm text-slate-300 list-decimal list-inside mb-2" {...props} />,
                              li: ({node, ...props}) => <li className="text-sm text-slate-300 ml-4 mb-1" {...props} />,
                              strong: ({node, ...props}) => <strong className="text-slate-100 font-semibold" {...props} />,
                              em: ({node, ...props}) => <em className="italic text-slate-200" {...props} />,
                            }}
                          >
                            {review.reviewText}
                          </ReactMarkdown>
                        </div>
                        {review.annotatedPdfUrl && (
                          <a href={review.annotatedPdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition-colors">
                            <Download className="w-4 h-4" /> Download Annotated PDF
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )) : recentReport ? (
                  <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 space-y-3">
                    <p className="text-xs font-medium text-slate-500">Latest run</p>
                    <div className="text-sm text-slate-300 leading-relaxed markdown-content whitespace-pre-wrap">
                      <ReactMarkdown
                        components={{
                          h1: ({node, ...props}) => <h1 className="text-base font-bold text-slate-100 mt-4 mb-2" {...props} />,
                          h2: ({node, ...props}) => <h2 className="text-sm font-bold text-slate-100 mt-3 mb-2" {...props} />,
                          h3: ({node, ...props}) => <h3 className="text-sm font-semibold text-slate-100 mt-2 mb-1" {...props} />,
                          p: ({node, ...props}) => <p className="text-sm text-slate-300 mb-2" {...props} />,
                          ul: ({node, ...props}) => <ul className="text-sm text-slate-300 list-disc list-inside mb-2" {...props} />,
                          ol: ({node, ...props}) => <ol className="text-sm text-slate-300 list-decimal list-inside mb-2" {...props} />,
                          li: ({node, ...props}) => <li className="text-sm text-slate-300 ml-4 mb-1" {...props} />,
                          strong: ({node, ...props}) => <strong className="text-slate-100 font-semibold" {...props} />,
                        }}
                      >
                        {typeof recentReport === 'string' ? recentReport : (recentReport.reviewText || recentReport.summaryReport || 'Review text not available')}
                      </ReactMarkdown>
                    </div>
                    {recentReport?.annotatedPdfUrl && (
                      <a href={recentReport.annotatedPdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition-colors">
                        <Download className="w-4 h-4" /> Download Annotated PDF
                      </a>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Compliance Result */}
          {comp && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
              <button
                onClick={() => setComplianceExpanded(v => !v)}
                className="w-full flex items-center justify-between p-4 hover:bg-emerald-500/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <ChevronDown className={`w-4 h-4 text-emerald-500/60 transition-transform ${complianceExpanded ? '' : '-rotate-90'}`} />
                  <p className="text-sm font-bold text-emerald-400 uppercase tracking-wider">Compliance Check</p>
                </div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const entries = Object.entries(comp) as [string, any][];
                    const failCount = entries.filter(([, v]) => v.status === 'fail').length;
                    const unknownCount = entries.filter(([, v]) => v.status === 'unknown').length;
                    const passCount = entries.filter(([, v]) => v.status === 'pass').length;
                    return (
                      <>
                        {failCount > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-300">{failCount} fail</span>}
                        {unknownCount > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">{unknownCount} ?</span>}
                        {passCount > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">{passCount} pass</span>}
                      </>
                    );
                  })()}
                </div>
              </button>

              {complianceExpanded && (
                <div className="p-4 pt-2 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-emerald-500/10 bg-slate-900/30">
                  {(Object.entries(comp) as [string, any][]).map(([key, val]) => {
                    let icon;
                    if (val.status === 'pass') icon = <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />;
                    else if (val.status === 'fail') icon = <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />;
                    else if (val.status === 'skipped') icon = <AlertCircle className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />;
                    else icon = <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />;
                    
                    return (
                      <div key={key} className="flex items-start gap-3 bg-slate-800/40 p-3 rounded-lg">
                        {icon}
                        <div>
                          <p className="text-xs font-medium text-slate-300 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{val.status === 'skipped' ? 'Not applicable' : (val.details || val.status)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Reference Verification */}
          {refReport && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
              <button
                onClick={() => setRefVerifExpanded(v => !v)}
                className="w-full flex items-center justify-between p-4 hover:bg-amber-500/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <ChevronDown className={`w-4 h-4 text-amber-500/60 transition-transform ${refVerifExpanded ? '' : '-rotate-90'}`} />
                  <p className="text-sm font-bold text-amber-400 uppercase tracking-wider">Reference Verification</p>
                </div>
                <div className="flex items-center gap-2">
                  {refReport.verifiedCount > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">{refReport.verifiedCount} ✓</span>}
                  {refReport.possibleMatchCount > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">{refReport.possibleMatchCount} ~</span>}
                  {refReport.notFoundCount > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-300">{refReport.notFoundCount} ✗</span>}
                  <span className="text-xs text-slate-500">/ {refReport.totalReferences}</span>
                </div>
              </button>

              {refVerifExpanded && (
                <div className="p-4 pt-2 space-y-3 border-t border-amber-500/10 bg-slate-900/30">
                  <div className="flex gap-2">
                    <button
                      onClick={() => refVerifFileRef.current?.click()}
                      disabled={runningRefVerif}
                      className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 font-medium transition-colors"
                    >
                      {runningRefVerif ? 'Running...' : 'Run Again (Standalone)'}
                    </button>
                    {refVerifError && <p className="text-xs text-red-400 self-center">{refVerifError}</p>}
                  </div>

                  {refReport.issues.length > 0 && (
                    <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
                      {refReport.issues.map((issue: string, i: number) => (
                        <p key={i} className="text-xs text-amber-300">{issue}</p>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar pr-2">
                    {refReport.references.map((ref: any) => {
                      const statusColors: Record<string, string> = {
                        verified: 'bg-emerald-500/20 text-emerald-300',
                        possible_match: 'bg-amber-500/20 text-amber-300',
                        not_found: 'bg-red-500/20 text-red-300',
                        metadata_mismatch: 'bg-orange-500/20 text-orange-300',
                        parse_failed: 'bg-slate-500/20 text-slate-300',
                      };
                      return (
                        <div key={ref.index} className="text-xs p-3 rounded-lg bg-slate-800/40 space-y-1.5 border border-slate-700/30">
                          <div className="flex items-start gap-3 justify-between">
                            <p className="text-slate-300 leading-relaxed">{ref.rawText}</p>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 uppercase tracking-wide ${statusColors[ref.status] || 'bg-slate-500/20 text-slate-300'}`}>
                              {ref.status.replace(/_/g, ' ')}
                            </span>
                          </div>
                          {ref.openAlexTitle && ref.openAlexTitle !== ref.parsedTitle && (
                            <p className="text-slate-500 text-[11px] mt-2">Found match: <span className="text-slate-300">{ref.openAlexTitle}</span></p>
                          )}
                          {ref.note && <p className="text-slate-400 italic text-[11px]">{ref.note}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empirical Standards Checklist */}
          {checklist?.selectedStandards?.length > 0 && (
            <div className="p-4 rounded-xl border border-violet-500/20 bg-violet-500/5 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap border-b border-violet-500/10 pb-3">
                <p className="text-sm font-bold text-violet-400 uppercase tracking-wider">Empirical Standards</p>
                {!finalizedChecklist && (
                  <div className="flex items-center gap-3">
                    <a
                      href={buildChecklistUrl(confirmedStandards)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" /> Open Form
                    </a>
                    <button
                      onClick={handleConfirmChecklist}
                      disabled={confirmedStandards.size === 0}
                      className="px-3 py-1.5 text-sm font-semibold rounded-xl bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-500/20"
                    >
                      Confirm Checklist
                    </button>
                  </div>
                )}
              </div>

              {finalizedChecklist ? (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-emerald-400 font-bold flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Checklist Confirmed</p>
                    <p className="text-xs text-emerald-400/70 mt-1">{finalizedChecklist.selectedStandards.length} standards selected</p>
                  </div>
                  <button
                    onClick={() => {
                      setFinalizedChecklist(null);
                      setConfirmedStandards(new Set(finalizedChecklist.selectedStandards));
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5 inline mr-1" /> Edit
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {(Object.entries(STANDARDS_BY_CATEGORY) as Array<[string, string[]]>).map(([category, standards]) => (
                    <div key={category} className="rounded-xl bg-slate-800/40 overflow-hidden border border-slate-700/50">
                      <button
                        onClick={() => {
                          const newExpanded = new Set(expandedCategories);
                          if (newExpanded.has(category)) newExpanded.delete(category);
                          else newExpanded.add(category);
                          setExpandedCategories(newExpanded);
                        }}
                        className="w-full flex items-center gap-3 p-3 hover:bg-slate-700/50 transition-colors"
                      >
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedCategories.has(category) ? '' : '-rotate-90'}`} />
                        <p className="text-sm font-semibold text-slate-200">{category}</p>
                        <span className="text-xs text-slate-500 ml-auto bg-slate-800 px-2 py-0.5 rounded-full">
                          {standards.filter(s => confirmedStandards.has(s)).length} / {standards.length}
                        </span>
                      </button>

                      {expandedCategories.has(category) && (
                        <div className="p-3 space-y-2 border-t border-slate-700/50 bg-slate-900/30">
                          {standards.map((standard) => {
                            const aiData = aiSelectedMap.get(standard);
                            return (
                              <label key={standard} className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 transition-colors cursor-pointer border border-slate-700/30">
                                <input
                                  type="checkbox"
                                  checked={confirmedStandards.has(standard)}
                                  onChange={(e) => {
                                    const newConfirmed = new Set<string>(confirmedStandards);
                                    if (e.target.checked) newConfirmed.add(standard);
                                    else newConfirmed.delete(standard);
                                    setConfirmedStandards(newConfirmed);
                                  }}
                                  className="mt-0.5 w-4 h-4 rounded border-slate-600 text-violet-500 focus:ring-violet-500 focus:ring-offset-slate-900 bg-slate-800"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <p className="text-sm text-slate-200 font-medium">{standard}</p>
                                    {aiData && (
                                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide shrink-0 ${
                                        aiData.confidence === 'high' ? 'bg-emerald-500/20 text-emerald-300'
                                        : aiData.confidence === 'medium' ? 'bg-amber-500/20 text-amber-300'
                                        : 'bg-orange-500/20 text-orange-300'
                                      }`}>
                                        {aiData.confidence} conf
                                      </span>
                                    )}
                                  </div>
                                  {aiData && <p className="text-xs text-slate-400 leading-relaxed">{aiData.evidence}</p>}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Checklist Answers */}
          {finalizedChecklist && (
            <div className="p-4 rounded-xl border border-violet-500/20 bg-violet-500/5 space-y-4">
              <div className="flex items-center justify-between border-b border-violet-500/10 pb-3">
                <p className="text-sm font-bold text-violet-400 uppercase tracking-wider">Checklist Answers</p>
                {checklistAnswerData && (() => {
                  const answers = checklistAnswerData.answers ?? [];
                  const no = answers.filter((a: any) => a.answer === 'no').length;
                  const unknown = answers.filter((a: any) => a.answer === 'unknown').length;
                  const yes = answers.filter((a: any) => a.answer === 'yes').length;
                  return (
                    <div className="flex items-center gap-2">
                      {no > 0 && (
                        <button
                          onClick={() => setChecklistAnswerFilter(f => f === 'no' ? null : 'no')}
                          className={`text-xs font-bold px-2 py-1 rounded transition-colors ${checklistAnswerFilter === 'no' ? 'bg-red-500/40 text-red-100 ring-1 ring-red-400/50' : 'bg-red-500/20 text-red-300 hover:bg-red-500/30'}`}
                        >{no} No</button>
                      )}
                      {unknown > 0 && (
                        <button
                          onClick={() => setChecklistAnswerFilter(f => f === 'unknown' ? null : 'unknown')}
                          className={`text-xs font-bold px-2 py-1 rounded transition-colors ${checklistAnswerFilter === 'unknown' ? 'bg-slate-500/40 text-slate-100 ring-1 ring-slate-400/50' : 'bg-slate-500/20 text-slate-400 hover:bg-slate-500/30'}`}
                        >{unknown} ?</button>
                      )}
                      {yes > 0 && (
                        <button
                          onClick={() => setChecklistAnswerFilter(f => f === 'yes' ? null : 'yes')}
                          className={`text-xs font-bold px-2 py-1 rounded transition-colors ${checklistAnswerFilter === 'yes' ? 'bg-emerald-500/40 text-emerald-100 ring-1 ring-emerald-400/50' : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'}`}
                        >{yes} Yes</button>
                      )}
                    </div>
                  );
                })()}
              </div>

              {!checklistAnswerData ? (
                <button
                  onClick={() => checklistAnswerFileRef.current?.click()}
                  disabled={isRunningChecklistAnswering}
                  className="w-full flex items-center justify-center gap-2 p-4 rounded-xl bg-violet-600/20 text-violet-300 border border-violet-500/30 hover:bg-violet-600/30 disabled:opacity-50 transition-colors text-sm font-semibold shadow-lg shadow-violet-500/10"
                >
                  {isRunningChecklistAnswering ? <><Loader2 className="w-5 h-5 animate-spin" /> Analyzing Document…</> : <><Cpu className="w-5 h-5" /> Run Automated Checklist Answering</>}
                </button>
              ) : (() => {
                const answerOrder: Record<string, number> = { no: 0, unknown: 1, yes: 2 };
                const answerMap = new Map<string, any>((checklistAnswerData.answers ?? []).map((a: any) => [a.itemId, a]));

                const grouped = new Map<string, Map<string, any[]>>();
                for (const item of (checklistAnswerData.items ?? [])) {
                  const std = item.standard;
                  const sec = item.sectionTitle ?? 'General';
                  if (!grouped.has(std)) grouped.set(std, new Map());
                  if (!grouped.get(std)!.has(sec)) grouped.get(std)!.set(sec, []);
                  grouped.get(std)!.get(sec)!.push({ item, answer: answerMap.get(item.id) });
                }

                grouped.forEach(sections => {
                  sections.forEach((entries, sec) => {
                    sections.set(sec, entries.sort((a: any, b: any) => (answerOrder[a.answer?.answer] ?? 1) - (answerOrder[b.answer?.answer] ?? 1)));
                  });
                });

                return (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-slate-400">Review the AI-generated answers below. Verify evidence for accuracy.</p>
                      <button
                        onClick={() => checklistAnswerFileRef.current?.click()}
                        disabled={isRunningChecklistAnswering}
                        className="text-xs px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 font-medium transition-colors disabled:opacity-50"
                      >
                        {isRunningChecklistAnswering ? 'Running...' : 'Run Again'}
                      </button>
                    </div>

                    {Array.from(grouped.entries()).map(([standard, sections]) => {
                      const stdAnswers = Array.from(sections.values()).flat().map((e: any) => e.answer?.answer);
                      const noCount = stdAnswers.filter(a => a === 'no').length;
                      const unknownCount = stdAnswers.filter(a => a === 'unknown').length;
                      const yesCount = stdAnswers.filter(a => a === 'yes').length;

                      if (checklistAnswerFilter && !stdAnswers.includes(checklistAnswerFilter)) return null;

                      const isExpanded = checklistAnswerFilter ? true : expandedChecklistStandards.has(standard);

                      return (
                        <div key={standard} className="rounded-xl bg-slate-800/60 overflow-hidden border border-slate-700/50">
                          <button
                            onClick={() => {
                              const next = new Set(expandedChecklistStandards);
                              if (next.has(standard)) next.delete(standard);
                              else next.add(standard);
                              setExpandedChecklistStandards(next);
                            }}
                            className="w-full flex items-center justify-between p-3 hover:bg-slate-700/50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                              <p className="text-sm font-bold text-slate-200">{standard}</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {noCount > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">{noCount} ✗</span>}
                              {unknownCount > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-400">{unknownCount} ?</span>}
                              {yesCount > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">{yesCount} ✓</span>}
                            </div>
                          </button>

                          {isExpanded && Array.from(sections.entries()).map(([section, entries]) => {
                            const visibleEntries = checklistAnswerFilter ? entries.filter((e: any) => e.answer?.answer === checklistAnswerFilter) : entries;
                            if (visibleEntries.length === 0) return null;
                            return (
                              <div key={section} className="p-3 space-y-3 border-t border-slate-700/50 bg-slate-900/30">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{section}</p>
                                {visibleEntries.map(({ item, answer }: any) => (
                                  <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/30">
                                    <span className={`shrink-0 mt-0.5 text-xs font-bold px-2 py-1 rounded min-w-[40px] text-center uppercase tracking-wider ${
                                      answer?.answer === 'yes' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
                                      : answer?.answer === 'no' ? 'bg-red-500/20 text-red-400 border border-red-500/20'
                                      : 'bg-slate-500/20 text-slate-400 border border-slate-500/20'
                                    }`}>
                                      {answer?.answer ?? '?'}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm text-slate-200 leading-relaxed font-medium">{item.itemText}</p>
                                      {answer?.evidence && (
                                        <div className="mt-2 p-2 rounded bg-slate-900/50 border border-slate-800">
                                          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Evidence</p>
                                          <p className="text-xs text-slate-400 leading-relaxed italic">"{answer.evidence}"</p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              {checklistAnswerError && <p className="text-sm text-red-400 bg-red-500/10 p-3 rounded-lg border border-red-500/20">{checklistAnswerError}</p>}
            </div>
          )}

          {/* Hidden inputs */}
          <input ref={aiFileRef} type="file" accept="application/pdf" className="hidden" onChange={handleAIFileSelected} />
          <input ref={complianceFileRef} type="file" accept="application/pdf" className="hidden" onChange={handleComplianceFileSelected} />
          <input ref={refVerifFileRef} type="file" accept="application/pdf" className="hidden" onChange={handleRefVerifFileSelected} />
          <input
            ref={checklistAnswerFileRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              e.target.value = '';
              setIsRunningChecklistAnswering(true);
              setChecklistAnswerError('');
              try {
                const res = await runEmpiricalChecklistAnsweringRequest(round.id, file);
                if (res.data) setChecklistAnswerData(res.data);
              } catch (err: any) {
                setChecklistAnswerError(err.message || 'Checklist answering failed. Please try again.');
              } finally {
                setIsRunningChecklistAnswering(false);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
