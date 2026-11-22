import { createHttpApiClient, type DashboardApiClient } from './api';
import { createMockApiClient } from './mock-api';

export const isStandaloneMode = import.meta.env.VITE_STANDALONE === 'true';

export const apiClient: DashboardApiClient = isStandaloneMode
  ? createMockApiClient()
  : createHttpApiClient();
