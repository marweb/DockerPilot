import { vi } from 'vitest';

class DockerMock {
  constructor(_options?: unknown) {}
}

vi.mock('dockerode', () => ({
  default: DockerMock,
}));
