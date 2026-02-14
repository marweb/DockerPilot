import api, { extractData } from './client';
import type {
  Image,
  ImageInspect,
  ImageHistory,
  ApiResponse,
  PaginatedResponse,
} from '@dockpilot/types';

/**
 * Image filters for list query
 */
export interface ImageFilters {
  dangling?: boolean;
  label?: string;
  reference?: string;
}

/**
 * Image list query parameters
 */
export interface ImageListParams {
  all?: boolean;
  filters?: ImageFilters;
  page?: number;
  pageSize?: number;
}

/**
 * Tag image request
 */
export interface TagImageRequest {
  repo: string;
  tag: string;
}

/**
 * Pull image request
 */
export interface PullImageRequest {
  fromImage: string;
  tag?: string;
  platform?: string;
  auth?: {
    username?: string;
    password?: string;
    auth?: string;
    email?: string;
    serveraddress?: string;
    identitytoken?: string;
    registrytoken?: string;
  };
}

/**
 * Pull image progress
 */
export interface PullImageProgress {
  status: string;
  id?: string;
  progress?: string;
  progressDetail?: {
    current?: number;
    total?: number;
  };
}

/**
 * Build image options
 */
export interface BuildImageOptions {
  dockerfile?: string;
  t?: string[];
  extrahosts?: string[];
  remote?: string;
  q?: boolean;
  nocache?: boolean;
  cachefrom?: string[];
  pull?: string;
  rm?: boolean;
  forcerm?: boolean;
  memory?: number;
  memswap?: number;
  cpushares?: number;
  cpusetcpus?: string;
  cpusetmems?: string;
  cgroupsparent?: string;
  buildargs?: Record<string, string>;
  shmsize?: number;
  squash?: boolean;
  labels?: Record<string, string>;
  networkmode?: string;
  platform?: string;
  target?: string;
  outputs?: string;
}

/**
 * Get all images with optional filtering
 * @param params Query parameters for filtering and pagination
 * @returns Paginated list of images
 */
export async function getImages(params: ImageListParams = {}): Promise<PaginatedResponse<Image>> {
  const response = await api.get<ApiResponse<PaginatedResponse<Image>>>('/images', {
    params,
  });
  return extractData(response);
}

/**
 * Get a single image by ID
 * @param id Image ID
 * @returns Image details
 */
export async function getImage(id: string): Promise<Image> {
  const response = await api.get<ApiResponse<Image>>(`/images/${id}`);
  return extractData(response);
}

/**
 * Get detailed image inspection
 * @param id Image ID
 * @returns Image inspection details
 */
export async function inspectImage(id: string): Promise<ImageInspect> {
  const response = await api.get<ApiResponse<ImageInspect>>(`/images/${id}/inspect`);
  return extractData(response);
}

/**
 * Get image history
 * @param id Image ID
 * @returns Image history layers
 */
export async function getImageHistory(id: string): Promise<ImageHistory[]> {
  const response = await api.get<ApiResponse<ImageHistory[]>>(`/images/${id}/history`);
  return extractData(response);
}

/**
 * Pull an image from registry
 * @param options Pull options with image name and tag
 * @returns Stream of pull progress events
 */
export async function pullImage(options: PullImageRequest): Promise<PullImageProgress[]> {
  const response = await api.post<ApiResponse<PullImageProgress[]>>('/images/pull', options);
  return extractData(response);
}

/**
 * Remove an image
 * @param id Image ID
 * @param force Force removal
 * @param noprune Do not delete untagged parent images
 * @returns Success status
 */
export async function removeImage(id: string, force?: boolean, noprune?: boolean): Promise<void> {
  await api.delete<ApiResponse<void>>(`/images/${id}`, {
    params: { force, noprune },
  });
}

/**
 * Tag an image
 * @param id Image ID
 * @param repo Repository name
 * @param tag Tag name
 * @returns Success status
 */
export async function tagImage(id: string, repo: string, tag: string): Promise<void> {
  await api.post<ApiResponse<void>>(`/images/${id}/tag`, null, {
    params: { repo, tag },
  });
}

/**
 * Push an image to registry
 * @param name Image name (including tag)
 * @returns Push progress
 */
export async function pushImage(name: string): Promise<PullImageProgress[]> {
  const response = await api.post<ApiResponse<PullImageProgress[]>>(`/images/${name}/push`);
  return extractData(response);
}

/**
 * Search images in Docker Hub
 * @param term Search term
 * @returns List of matching images
 */
export async function searchImages(term: string): Promise<
  Array<{
    name: string;
    description: string;
    is_official: boolean;
    is_automated: boolean;
    star_count: number;
  }>
> {
  const response = await api.get<
    ApiResponse<
      Array<{
        name: string;
        description: string;
        is_official: boolean;
        is_automated: boolean;
        star_count: number;
      }>
    >
  >('/images/search', {
    params: { term },
  });
  return extractData(response);
}

/**
 * Prune unused images
 * @param filters Filters for pruning
 * @returns Prune results
 */
export async function pruneImages(filters?: {
  dangling?: boolean;
  until?: string;
  label?: string[];
}): Promise<{
  imagesDeleted: Array<{
    deleted: string;
    untagged?: string[];
  }>;
  spaceReclaimed: number;
}> {
  const response = await api.post<
    ApiResponse<{
      imagesDeleted: Array<{
        deleted: string;
        untagged?: string[];
      }>;
      spaceReclaimed: number;
    }>
  >('/images/prune', null, {
    params: { filters },
  });
  return extractData(response);
}

/**
 * Export image to tarball
 * @param names Image names to export
 * @returns Blob data
 */
export async function exportImage(names: string[]): Promise<Blob> {
  const response = await api.get(`/images/export`, {
    params: { names: names.join(',') },
    responseType: 'blob',
  });
  return response.data as Blob;
}

/**
 * Import image from tarball
 * @param data Tarball data
 * @param repository Optional repository name
 * @param tag Optional tag
 * @returns Import result
 */
export async function importImage(
  data: Blob,
  repository?: string,
  tag?: string
): Promise<{ status: string }> {
  const formData = new FormData();
  formData.append('file', data);

  const response = await api.post<ApiResponse<{ status: string }>>('/images/import', formData, {
    params: { repository, tag },
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return extractData(response);
}
