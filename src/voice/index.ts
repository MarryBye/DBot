import { config } from '../config.js';
import { VoiceWorkerPool } from './worker-pool.js';

export const workerPool = new VoiceWorkerPool(config.workerTokens);
export * from './worker-pool.js';
