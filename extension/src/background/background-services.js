import { registerService } from '@core/service-registry.js';
import { AuthManager } from '@services/auth/auth-manager.js';
import { ApiClient } from '@services/api/api-client.js';
import { StateManager } from '@services/state/state-manager.js';
import { AnalysisQueue } from '@services/analysis/analysis-queue.js';
import { ProgressTracker } from '@utils/progress-tracker.js';

export function registerBackgroundServices() {
  // Register services specific to background script
  registerService('auth-manager', AuthManager, { singleton: true });
  registerService('api-client', ApiClient, { singleton: true });
  registerService('state-manager', StateManager, { singleton: true });
  registerService('analysis-queue', AnalysisQueue, { singleton: true });
  registerService('progress-tracker', ProgressTracker, { singleton: true });
}