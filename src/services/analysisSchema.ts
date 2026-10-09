import { BASE_STYLES, SCORE_KEYS } from '../constants';
import { ASSESSMENT_STATES, CONFIDENCE_LEVELS, ASSESSMENT_METHODS } from '../types/diagnostics';

export const ANALYSIS_RESULT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'scores',
    'assessments',
    'findings',
    'summary',
    'overallTone',
    'recommendations',
    'personalization',
    'contextAnalysis',
    'euphemisms',
  ],
  properties: {
    assessments: {
      type: 'object',
      additionalProperties: false,
      required: SCORE_KEYS,
      properties: Object.fromEntries(SCORE_KEYS.map((id) => [id, {
        type: 'object',
        additionalProperties: false,
        required: ['status', 'reason', 'confidence', 'method'],
        properties: {
          status: { type: 'string', enum: ASSESSMENT_STATES },
          reason: { type: 'string' },
          confidence: { type: 'string', enum: CONFIDENCE_LEVELS },
          method: { type: 'string', enum: ASSESSMENT_METHODS },
        },
      }])),
    },
    scores: {
      type: 'object',
      additionalProperties: false,
      required: SCORE_KEYS,
      properties: Object.fromEntries(SCORE_KEYS.map((id) => [id, { type: 'number' }])),
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['category', 'text', 'explanation', 'severity', 'confidence', 'method', 'rlhfLogic', 'evidence'],
        properties: {
          category: { type: 'string' },
          text: { type: 'string' },
          explanation: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          confidence: { type: 'string', enum: CONFIDENCE_LEVELS },
          method: { type: 'string', enum: ASSESSMENT_METHODS },
          rlhfLogic: { type: ['string', 'null'] },
          evidence: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['startOffset', 'endOffset', 'matchedText'],
            properties: {
              startOffset: { type: ['integer', 'null'] },
              endOffset: { type: ['integer', 'null'] },
              matchedText: { type: 'string' },
            },
          },
        },
      },
    },
    summary: { type: 'string' },
    overallTone: { type: 'string' },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description', 'promptSnippet'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          promptSnippet: { type: 'string' },
        },
      },
    },
    personalization: {
      type: 'object',
      additionalProperties: false,
      required: [
        'baseStyle',
        'directness',
        'neutrality',
        'brevity',
        'humility',
        'chatgptCharacteristics',
        'stonewallingRemediation',
        'customInstructions',
      ],
      properties: {
        baseStyle: {
          type: 'string',
          enum: BASE_STYLES.map(({ style }) => style),
        },
        directness: { type: 'string', enum: ['More', 'Default', 'Less'] },
        neutrality: { type: 'string', enum: ['More', 'Default', 'Less'] },
        brevity: { type: 'string', enum: ['More', 'Default', 'Less'] },
        humility: { type: 'string', enum: ['More', 'Default', 'Less'] },
        chatgptCharacteristics: {
          type: 'object',
          additionalProperties: false,
          required: ['warmth', 'enthusiasm', 'headersAndLists', 'emojis'],
          properties: {
            warmth: { type: 'string', enum: ['More', 'Default', 'Less'] },
            enthusiasm: { type: 'string', enum: ['More', 'Default', 'Less'] },
            headersAndLists: { type: 'string', enum: ['More', 'Default', 'Less'] },
            emojis: { type: 'string', enum: ['More', 'Default', 'Less'] },
          },
        },
        stonewallingRemediation: { type: 'string' },
        customInstructions: { type: 'array', items: { type: 'string' } },
      },
    },
    contextAnalysis: {
      type: 'object',
      additionalProperties: false,
      required: ['score', 'feedback', 'heatmap'],
      properties: {
        score: { type: 'number' },
        feedback: { type: 'string' },
        heatmap: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['text', 'density', 'explanation', 'suggestion'],
            properties: {
              text: { type: 'string' },
              density: { type: 'string', enum: ['low', 'medium', 'high'] },
              explanation: { type: ['string', 'null'] },
              suggestion: { type: ['string', 'null'] },
            },
          },
        },
      },
    },
    euphemisms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['term', 'translation', 'context'],
        properties: {
          term: { type: 'string' },
          translation: { type: 'string' },
          context: { type: 'string' },
        },
      },
    },
  },
} as const;