import { RoundService } from '../services/RoundService';

const INTERVAL_MS = 60 * 60 * 1000; // run every hour

export function startOverdueChecker(): void {
  const run = async () => {
    try {
      await RoundService.checkAndMarkOverdue();
    } catch (err) {
      console.error('Overdue checker error:', err);
    }
  };

  run();
  setInterval(run, INTERVAL_MS);
}
