import api, { extractData } from './client';
import type {
  ComposeStack,
  ComposeService,
  ApiResponse,
  PaginatedResponse,
} from '@dockpilot/types';

/**
 * Compose stack filters
 */
export interface StackFilters {
  status?: 'running' | 'stopped' | 'partial';
  name?: string;
}

/**
 * Stack list query parameters
 */
export interface StackListParams {
  filters?: StackFilters;
  page?: number;
  pageSize?: number;
}

/**
 * Deploy stack request
 */
export interface DeployStackRequest {
  name: string;
  compose: string;
  env?: Record<string, string>;
  detach?: boolean;
  build?: boolean;
  removeOrphans?: boolean;
  pull?: boolean;
}

/**
 * Deploy stack response
 */
export interface DeployStackResponse {
  success: boolean;
  stack: ComposeStack;
  services: ComposeService[];
  warnings?: string[];
}

/**
 * Stack logs options
 */
export interface StackLogsOptions {
  services?: string[];
  tail?: number;
  since?: string;
  until?: string;
  timestamps?: boolean;
  follow?: boolean;
}

/**
 * Stack log entry
 */
export interface StackLogEntry {
  service: string;
  container: string;
  timestamp: string;
  message: string;
}

/**
 * Stack action request (start/stop/restart)
 */
export interface StackActionRequest {
  services?: string[];
  timeout?: number;
}

/**
 * Get all Docker Compose stacks
 * @param params Query parameters for filtering and pagination
 * @returns Paginated list of stacks
 */
export async function getStacks(
  params: StackListParams = {}
): Promise<PaginatedResponse<ComposeStack>> {
  const response = await api.get<ApiResponse<PaginatedResponse<ComposeStack>>>('/compose', {
    params,
  });
  return extractData(response);
}

/**
 * Get a single stack by name
 * @param name Stack name
 * @returns Stack details with services
 */
export async function getStack(name: string): Promise<ComposeStack> {
  const response = await api.get<ApiResponse<ComposeStack>>(`/compose/${name}`);
  return extractData(response);
}

/**
 * Deploy a new stack or update existing
 * @param data Deploy options with name and compose YAML
 * @returns Deploy result with stack info
 */
export async function deployStack(data: DeployStackRequest): Promise<DeployStackResponse> {
  const response = await api.post<ApiResponse<DeployStackResponse>>('/compose', data);
  return extractData(response);
}

/**
 * Deploy stack from file upload
 * @param name Stack name
 * @param composeFile Compose YAML file
 * @param envVars Optional environment variables file
 * @returns Deploy result
 */
export async function deployStackFromFile(
  name: string,
  composeFile: File,
  envVars?: File
): Promise<DeployStackResponse> {
  const formData = new FormData();
  formData.append('name', name);
  formData.append('compose', composeFile);
  if (envVars) {
    formData.append('env', envVars);
  }

  const response = await api.post<ApiResponse<DeployStackResponse>>('/compose/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return extractData(response);
}

/**
 * Remove a stack
 * @param name Stack name
 * @param removeVolumes Remove associated volumes
 * @param removeImages Remove associated images
 * @returns Success status
 */
export async function removeStack(
  name: string,
  removeVolumes?: boolean,
  removeImages?: boolean
): Promise<void> {
  await api.delete<ApiResponse<void>>(`/compose/${name}`, {
    params: { removeVolumes, removeImages },
  });
}

/**
 * Get stack logs
 * @param name Stack name
 * @param options Log options
 * @returns Stack logs
 */
export async function getStackLogs(
  name: string,
  options: StackLogsOptions = {}
): Promise<StackLogEntry[]> {
  const response = await api.get<ApiResponse<StackLogEntry[]>>(`/compose/${name}/logs`, {
    params: options,
  });
  return extractData(response);
}

/**
 * Start all services in a stack
 * @param name Stack name
 * @param request Optional service selection and timeout
 * @returns Success status
 */
export async function startStack(name: string, request?: StackActionRequest): Promise<void> {
  await api.post<ApiResponse<void>>(`/compose/${name}/start`, request);
}

/**
 * Stop all services in a stack
 * @param name Stack name
 * @param request Optional service selection and timeout
 * @returns Success status
 */
export async function stopStack(name: string, request?: StackActionRequest): Promise<void> {
  await api.post<ApiResponse<void>>(`/compose/${name}/stop`, request);
}

/**
 * Restart all services in a stack
 * @param name Stack name
 * @param request Optional service selection and timeout
 * @returns Success status
 */
export async function restartStack(name: string, request?: StackActionRequest): Promise<void> {
  await api.post<ApiResponse<void>>(`/compose/${name}/restart`, request);
}

/**
 * Pull images for all services in a stack
 * @param name Stack name
 * @param services Optional specific services to pull
 * @returns Pull progress
 */
export async function pullStackImages(
  name: string,
  services?: string[]
): Promise<
  Array<{
    service: string;
    status: string;
    progress?: string;
  }>
> {
  const response = await api.post<
    ApiResponse<
      Array<{
        service: string;
        status: string;
        progress?: string;
      }>
    >
  >(`/compose/${name}/pull`, { services });
  return extractData(response);
}

/**
 * Build images for all services in a stack
 * @param name Stack name
 * @param services Optional specific services to build
 * @param noCache Build without cache
 * @returns Build results
 */
export async function buildStackImages(
  name: string,
  services?: string[],
  noCache?: boolean
): Promise<
  Array<{
    service: string;
    success: boolean;
    error?: string;
  }>
> {
  const response = await api.post<
    ApiResponse<
      Array<{
        service: string;
        success: boolean;
        error?: string;
      }>
    >
  >(`/compose/${name}/build`, { services, noCache });
  return extractData(response);
}

/**
 * Validate compose file
 * @param compose Compose YAML content
 * @returns Validation result
 */
export async function validateCompose(compose: string): Promise<{
  valid: boolean;
  errors?: string[];
  services?: string[];
}> {
  const response = await api.post<
    ApiResponse<{
      valid: boolean;
      errors?: string[];
      services?: string[];
    }>
  >('/compose/validate', { compose });
  return extractData(response);
}

/**
 * Get compose file for a stack
 * @param name Stack name
 * @returns Compose YAML content
 */
export async function getStackCompose(name: string): Promise<string> {
  const response = await api.get<ApiResponse<string>>(`/compose/${name}/compose`);
  return extractData(response);
}

/**
 * Update stack compose file
 * @param name Stack name
 * @param compose New compose YAML content
 * @returns Success status
 */
export async function updateStackCompose(name: string, compose: string): Promise<void> {
  await api.put<ApiResponse<void>>(`/compose/${name}/compose`, { compose });
}

/**
 * Scale services in a stack
 * @param name Stack name
 * @param services Service name to replica count mapping
 * @returns Success status
 */
export async function scaleStackServices(
  name: string,
  services: Record<string, number>
): Promise<void> {
  await api.post<ApiResponse<void>>(`/compose/${name}/scale`, { services });
}

/**
 * Get stack environment variables
 * @param name Stack name
 * @returns Environment variables
 */
export async function getStackEnv(name: string): Promise<Record<string, string>> {
  const response = await api.get<ApiResponse<Record<string, string>>>(`/compose/${name}/env`);
  return extractData(response);
}

/**
 * Update stack environment variables
 * @param name Stack name
 * @param env Environment variables
 * @returns Success status
 */
export async function updateStackEnv(name: string, env: Record<string, string>): Promise<void> {
  await api.put<ApiResponse<void>>(`/compose/${name}/env`, { env });
}
