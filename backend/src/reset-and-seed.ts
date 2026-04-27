import { runSeed } from './seed';

runSeed({ reset: true }).catch(err => {
  console.error(err);
  process.exitCode = 1;
});
