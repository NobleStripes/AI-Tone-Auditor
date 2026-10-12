import { CATEGORY_REGISTRY } from '../../constants';
import { emptyAnalysisResult, type AnalysisResult, type Finding } from '../../types/analysis';
import { isEligibleEvidence, restoreEvidence } from '../evidence';

const HIDDEN_PROCESS = /\b(?:(?:the )?(?:ai|model|assistant|system|it)\s+(?:\w+\s+){0,3}(?:intends?|intended|wants?|wanted|thinks?|knows?|believes?|pretends?|deliberately|reasoned|lied|lies|deceives?|manipulates?|was trained|is trained|(?:trying|attempting) to (?:manipulate|deceive|evade))|training|rlhf|hidden (?:intent|reasoning|retrieval|tool)|chain.of.thought|internal (?:reasoning|motivation)|(?:intentions?|motives?) (?:is|are|was|were)|(?:uses?|used|did not use|does not use|didn't use|never used) (?:a |the |any )?(?:tools?|search|retrieval)|(?:tools?|search|retrieval) (?:was|were) (?:not )?(?:used|performed)|no (?:tools?|search|retrieval) (?:was|were))\b/i;
const CAUTION = /\b(?:(?:cannot|can't|does not|do not) (?:establish|prove|show|verify|infer|determine|know|reveal|confirm|mean|imply)|cannot be (?:inferred|established|verified|determined|known)|not (?:proof|evidence|establish|verified)|may|might|could|uncertain|unknown|hypothetical|verify whether|no (?:proof|evidence))\b/i;
const CLAIM_WARNING = 'Interpretation withheld: response wording cannot establish hidden intentions, training, internal reasoning, or tool usage.';
const WITHHELD = 'Aggregate interpretation withheld: one or more findings or positive risk scores lack eligible, verified evidence. Inspect supported quotations and assessment states; this is not a clean bill of health.';

export function qualifyExplanation(text: string): string {
  return (text.match(/[^.!?\n]+(?:[.!?]+|\n|$)/g) ?? []).map(sentence =>
    HIDDEN_PROCESS.test(sentence) && !CAUTION.test(sentence) ? `${CLAIM_WARNING} ` : sentence).join('').trim();
}

function categoryFor(finding: Finding) {
  const label = finding.category.trim().toLowerCase();
  return CATEGORY_REGISTRY.find(category => category.label.toLowerCase() === label
    || (category.id === 'dismissive' && label === 'dismissive language'));
}

function supported(finding: Finding, result: AnalysisResult): boolean {
  const evidence = finding.evidence;
  if (!isEligibleEvidence(evidence) || !evidence || evidence.matchedText !== finding.text
    || !Number.isInteger(evidence.startOffset) || !Number.isInteger(evidence.endOffset)
    || evidence.startOffset! < 0 || evidence.endOffset! - evidence.startOffset! !== finding.text.length) return false;
  if (evidence.kind !== 'response_scope') return true;
  const category = categoryFor(finding);
  return finding.method === 'lexical_rule' && (category?.id === 'grounding_avoidance' || category?.id === 'refusal_quality')
    && result.assessments[category.id].method === 'lexical_rule' && evidence.startOffset === 0;
}

export function enforceReportIntegrity(input: AnalysisResult, responseText?: string, forceWithhold = false): AnalysisResult {
  const result = structuredClone(input);
  let withheld = forceWithhold;
  for (const finding of result.findings) {
    if (finding.evidence?.kind === 'response_scope' && (!supported(finding, result)
      || (responseText !== undefined && finding.text !== responseText))) {
      finding.evidence = { ...finding.evidence, verification: 'unverified',
        reason: 'Inspection only: response-scope evidence requires an explicit local absence-based check of the full response.' };
    } else if (responseText !== undefined) finding.evidence = restoreEvidence(responseText, finding.text, finding.evidence);
    const category = categoryFor(finding);
    if (!supported(finding, result) || (category && result.assessments[category.id].status !== 'assessed')) {
      withheld = true;
      finding.explanation = 'Inspection only: this reported finding is unsupported, excluded, or not assessed. It does not establish the reported conclusion.';
      finding.rlhfLogic = undefined;
      finding.confidence = 'unknown';
    } else {
      finding.explanation = qualifyExplanation(finding.explanation);
      if (finding.rlhfLogic) finding.rlhfLogic = qualifyExplanation(finding.rlhfLogic);
    }
  }
  for (const category of CATEGORY_REGISTRY) {
    const assessment = result.assessments[category.id];
    if (assessment.status !== 'assessed') {
      if (result.scores[category.id] > 0) withheld = true;
      result.scores[category.id] = 0;
      assessment.confidence = 'unknown';
    } else if (category.kind === 'risk' && result.scores[category.id] > 0
      && !result.findings.some(finding => categoryFor(finding)?.id === category.id && supported(finding, result))) {
      result.scores[category.id] = 0;
      result.assessments[category.id] = {
        status: 'not_assessed', confidence: 'unknown', method: assessment.method,
        reason: 'Positive diagnostic withheld: no eligible, verified evidence supports it.',
      };
      withheld = true;
    } else if (result.scores[category.id] > 0 && result.findings.some(finding =>
      categoryFor(finding)?.id === category.id && !supported(finding, result))) {
      const caution = ' Some reported evidence was excluded or unverified; the score magnitude is not independently validated.';
      if (!assessment.reason.includes(caution.trim())) assessment.reason += caution;
    }
    result.assessments[category.id].reason = qualifyExplanation(result.assessments[category.id].reason);
  }
  if (withheld) {
    result.summary = WITHHELD;
    result.overallTone = 'Withheld pending evidence review';
    result.recommendations = [];
    result.personalization = { ...emptyAnalysisResult().personalization, stonewallingRemediation: 'Withheld pending evidence review.' };
    result.contextAnalysis = { score: 0, feedback: WITHHELD, heatmap: [] };
    result.euphemisms = [];
  } else {
    result.summary = qualifyExplanation(result.summary);
    result.overallTone = qualifyExplanation(result.overallTone);
    result.recommendations = result.recommendations.map(item => ({
      title: qualifyExplanation(item.title), description: qualifyExplanation(item.description), promptSnippet: qualifyExplanation(item.promptSnippet),
    }));
    result.personalization.stonewallingRemediation = qualifyExplanation(result.personalization.stonewallingRemediation);
    result.personalization.customInstructions = result.personalization.customInstructions.map(qualifyExplanation);
    result.contextAnalysis.feedback = qualifyExplanation(result.contextAnalysis.feedback);
    result.contextAnalysis.heatmap = result.contextAnalysis.heatmap.map(item => ({
      ...item, ...(item.explanation ? { explanation: qualifyExplanation(item.explanation) } : {}),
      ...(item.suggestion ? { suggestion: qualifyExplanation(item.suggestion) } : {}),
    }));
    result.euphemisms = result.euphemisms.map(item => ({ ...item, translation: qualifyExplanation(item.translation), context: qualifyExplanation(item.context) }));
  }
  return result;
}
