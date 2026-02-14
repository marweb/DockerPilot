// User and Auth Types
export type UserRole = 'admin' | 'operator' | 'viewer';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

export interface SetupRequest {
  username: string;
  password: string;
}

// Container Types
export type ContainerStatus =
  | 'created'
  | 'running'
  | 'paused'
  | 'restarting'
  | 'removing'
  | 'exited'
  | 'dead';

export interface Container {
  id: string;
  name: string;
  image: string;
  status: ContainerStatus;
  state: string;
  created: number;
  ports: PortMapping[];
  labels: Record<string, string>;
  networks: string[];
  command?: string;
  entrypoint?: string[];
  env?: string[];
}

export interface PortMapping {
  containerPort: number;
  hostPort?: number;
  hostIp?: string;
  protocol: 'tcp' | 'udp';
}

export interface ContainerStats {
  id: string;
  name: string;
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
  blockRead: number;
  blockWrite: number;
}

export interface ContainerInspect {
  id: string;
  created: string;
  path: string;
  args: string[];
  state: {
    status: string;
    running: boolean;
    paused: boolean;
    restarting: boolean;
    oomKilled: boolean;
    dead: boolean;
    pid: number;
    exitCode: number;
    error: string;
    startedAt: string;
    finishedAt: string;
  };
  image: string;
  networkSettings: Record<string, unknown>;
  mounts: Array<{
    type: string;
    name?: string;
    source: string;
    destination: string;
    mode: string;
    rw: boolean;
  }>;
  config: {
    hostname: string;
    domainname: string;
    user: string;
    attachStdin: boolean;
    attachStdout: boolean;
    attachStderr: boolean;
    exposedPorts?: Record<string, unknown>;
    tty: boolean;
    openStdin: boolean;
    stdinOnce: boolean;
    env?: string[];
    cmd?: string[];
    image: string;
    workingDir: string;
    labels: Record<string, string>;
  };
}

export interface ContainerCreateOptions {
  name?: string;
  image: string;
  env?: string[];
  ports?: PortMapping[];
  volumes?: VolumeMount[];
  networks?: string[];
  command?: string[];
  labels?: Record<string, string>;
}

export interface VolumeMount {
  type: 'bind' | 'volume' | 'tmpfs';
  source: string;
  target: string;
  readOnly?: boolean;
}

// Image Types
export interface Image {
  id: string;
  repository: string;
  tag: string;
  size: number;
  created: number;
  labels: Record<string, string>;
  containers: number;
}

export interface ImageInspect {
  id: string;
  repoTags: string[];
  repoDigests: string[];
  created: string;
  size: number;
  virtualSize: number;
  architecture: string;
  os: string;
  author: string;
  config: {
    hostname: string;
    domainname: string;
    user: string;
    attachStdin: boolean;
    attachStdout: boolean;
    attachStderr: boolean;
    exposedPorts?: Record<string, unknown>;
    tty: boolean;
    openStdin: boolean;
    stdinOnce: boolean;
    env?: string[];
    cmd?: string[];
    image: string;
    workingDir: string;
    labels: Record<string, string>;
  };
  rootFS: {
    type: string;
    layers: string[];
  };
}

export interface ImageHistory {
  id: string;
  created: number;
  createdBy: string;
  size: number;
  comment: string;
}

export interface ImagePullOptions {
  fromImage: string;
  tag?: string;
  platform?: string;
}

// Volume Types
export interface Volume {
  name: string;
  driver: string;
  mountpoint: string;
  createdAt?: string;
  labels: Record<string, string>;
  scope: 'local' | 'global';
  options?: Record<string, string>;
  usageData?: {
    size: number;
    refCount: number;
  };
}

export interface VolumeInspect {
  name: string;
  driver: string;
  mountpoint: string;
  createdAt?: string;
  labels: Record<string, string>;
  scope: 'local' | 'global';
  options?: Record<string, string>;
  status?: Record<string, unknown>;
  usageData?: {
    size: number;
    refCount: number;
  };
}

// Network Types
export interface Network {
  id: string;
  name: string;
  driver: string;
  scope: 'local' | 'swarm';
  subnet?: string;
  gateway?: string;
  ipam: {
    driver: string;
    config: Array<{
      subnet: string;
      gateway?: string;
    }>;
  };
  containers?: Record<
    string,
    {
      name: string;
      endpointId: string;
      macAddress: string;
      ipv4Address: string;
      ipv6Address: string;
    }
  >;
  labels: Record<string, string>;
}

export interface NetworkCreateOptions {
  name: string;
  driver?: string;
  subnet?: string;
  gateway?: string;
  labels?: Record<string, string>;
}

// Build Types
export interface BuildOptions {
  context: string;
  dockerfile?: string;
  tags: string[];
  buildArgs?: Record<string, string>;
  target?: string;
  platform?: string;
  noCache?: boolean;
  pull?: boolean;
}

export interface BuildProgress {
  id: string;
  status: 'building' | 'success' | 'error';
  step?: string;
  message?: string;
  error?: string;
  progress?: number;
}

// Compose Types
export interface ComposeStack {
  name: string;
  projectDir: string;
  status: 'running' | 'stopped' | 'partial';
  services: ComposeService[];
  createdAt?: Date;
}

export interface ComposeService {
  name: string;
  containerId?: string;
  image: string;
  status: string;
  ports: PortMapping[];
  command?: string;
}

export interface ComposeUpOptions {
  name: string;
  yaml: string;
  detach?: boolean;
  build?: boolean;
  removeOrphans?: boolean;
}

export interface ComposeDownOptions {
  name: string;
  removeVolumes?: boolean;
  removeImages?: boolean;
}

// Tunnel Types
export type TunnelStatus = 'active' | 'inactive' | 'error' | 'creating';

export interface Tunnel {
  id: string;
  name: string;
  accountId: string;
  zoneId?: string;
  status: TunnelStatus;
  createdAt: Date;
  publicUrl?: string;
  ingressRules: IngressRule[];
  connectedServices: string[];
  autoStart?: boolean;
}

export interface IngressRule {
  hostname: string;
  service: string;
  path?: string;
  port: number;
}

export interface TunnelCreateOptions {
  name: string;
  zoneId?: string;
}

export interface TunnelCredentials {
  tunnelId: string;
  accountId: string;
  tunnelSecret: string;
}

// System Types
export interface DockerInfo {
  id: string;
  containers: number;
  containersRunning: number;
  containersStopped: number;
  containersPaused: number;
  images: number;
  driver: string;
  driverStatus: Array<[string, string]>;
  dockerRootDir: string;
  operatingSystem: string;
  architecture: string;
  cpus: number;
  memoryLimit: boolean;
  swapLimit: boolean;
  kernelVersion: string;
  kernelMemory: boolean;
  osType: string;
  os: string;
  name: string;
  serverVersion: string;
}

export interface DockerVersion {
  version: string;
  apiVersion: string;
  gitCommit: string;
  goVersion: string;
  os: string;
  arch: string;
  buildTime: string;
}

export interface DiskUsage {
  layersSize: number;
  images: Array<{
    id: string;
    size: number;
    sharedSize: number;
    virtualSize: number;
  }>;
  containers: Array<{
    id: string;
    sizeRw: number;
    sizeRootFs: number;
  }>;
  volumes: Array<{
    name: string;
    size: number;
  }>;
}

// Audit Log Types
export type AuditAction =
  | 'container.start'
  | 'container.stop'
  | 'container.restart'
  | 'container.kill'
  | 'container.remove'
  | 'container.create'
  | 'image.pull'
  | 'image.remove'
  | 'volume.remove'
  | 'network.remove'
  | 'build.execute'
  | 'compose.up'
  | 'compose.down'
  | 'tunnel.create'
  | 'tunnel.delete'
  | 'tunnel.start'
  | 'tunnel.stop'
  | 'user.create'
  | 'user.update'
  | 'user.delete'
  | 'auth.login'
  | 'auth.logout';

export interface AuditLog {
  id: string;
  timestamp: Date;
  userId: string;
  username: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ip: string;
  userAgent: string;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// WebSocket Message Types
export type WebSocketMessageType =
  | 'container.logs'
  | 'container.stats'
  | 'container.exec'
  | 'build.progress'
  | 'docker.events';

export interface WebSocketMessage<T = unknown> {
  type: WebSocketMessageType;
  payload: T;
  timestamp: number;
}

// Error Types
export interface ApiError {
  code: string;
  message: string;
  statusCode: number;
  details?: unknown;
}

export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  BAD_REQUEST: 'BAD_REQUEST',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DOCKER_ERROR: 'DOCKER_ERROR',
  TUNNEL_ERROR: 'TUNNEL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
