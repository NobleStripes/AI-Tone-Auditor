import { parseRealWorldDataset as parseRealWorld, parseSyntheticDataset as parseSynthetic } from '../../../src/services/evaluationValidation';
import { hashInput } from './metrics';
export { parseFailureLedger } from '../../../src/services/evaluationValidation';

export const parseRealWorldDataset = (value: unknown) => parseRealWorld(value, hashInput);
export const parseSyntheticDataset = (value: unknown) => parseSynthetic(value, hashInput);
