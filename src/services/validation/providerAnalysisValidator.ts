import { ANALYSIS_RESULT_JSON_SCHEMA } from '../analysisSchema';
import { validateAnalysisResult } from './analysisValidator';

interface Schema {
  type: string | readonly string[];
  enum?: readonly unknown[];
  properties?: Record<string, Schema>;
  required?: readonly string[];
  additionalProperties?: boolean;
  items?: Schema;
}

// Validate the provider wire contract before applying permissive history normalization.
function checkSchema(value: unknown, schema: Schema, path: string): void {
  const fail = () => { throw new Error(`Invalid provider analysis structure at ${path}.`); };
  const types = typeof schema.type === 'string' ? [schema.type] : schema.type;
  const matchesType = types.some(type => {
    if (type === 'null') return value === null;
    if (type === 'array') return Array.isArray(value);
    if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
    if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
    return typeof value === type;
  });
  if (!matchesType || (schema.enum && !schema.enum.includes(value))) fail();
  if (value === null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => checkSchema(item, schema.items!, `${path}[${index}]`));
  } else if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(record, key)) checkSchema(undefined, schema.properties![key], `${path}.${key}`);
    }
    for (const key of Object.keys(record)) {
      const property = schema.properties && Object.hasOwn(schema.properties, key) ? schema.properties[key] : undefined;
      if (property) checkSchema(record[key], property, `${path}.${key}`);
      else if (schema.additionalProperties === false) fail();
    }
  }
}

export function validateProviderAnalysisResult(payload: unknown, responseText: string) {
  checkSchema(payload, ANALYSIS_RESULT_JSON_SCHEMA, 'analysis');
  return validateAnalysisResult(payload, { assessmentMethod: 'semantic', responseText });
}
