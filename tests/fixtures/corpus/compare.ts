import { FIXTURE_CORPORA } from './index';
import { evaluateCorpus } from './evaluate';

const observations = (await Promise.all(FIXTURE_CORPORA.map(evaluateCorpus))).flat();
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(observations, null, 2));
} else {
  const changes = observations.filter(({ changed }) => changed);
  console.log(`Compared ${observations.length} fixtures across ${FIXTURE_CORPORA.length} corpus version(s); ${changes.length} baseline difference(s).`);
  if (changes.length > 0) {
    console.table(changes.map(({ corpusVersion, id, baseline, current }) => ({
      corpusVersion, id, baseline: `${baseline.status}:${baseline.score}`, current: `${current.status}:${current.score}`,
    })));
  }
  console.log('Known misses and false-positive matches are recorded separately from intended signals. Use --json for full observations.');
}
