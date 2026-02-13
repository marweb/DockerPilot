import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDocker, getDockerInfo, getDockerVersion, checkDockerConnection } from '../services/docker.js';
import type { DockerInfo, DockerVersion, DiskUsage } from '@dockpilot/types';

// Track upgrade state
let upgradeInProgress = false;
let upgradeContainerId: string | null = null;
let upgradeStartedAt: string | null = null;
let upgradeTargetVersion: string | null = null;

const upgradeBodySchema = z.object({
  version: z.string().min(1),
});

export async function systemRoutes(fastify: FastifyInstance) {
  // Detailed Docker health check (available at /health)
  fastify.get('/health', async (_request, reply) => {
    const dockerConnected = await checkDockerConnection();
    
    if (!dockerConnected) {
      return reply.status(503).send({
        status: 'unhealthy',
        docker: 'disconnected',
      });
    }

    return reply.send({
      status: 'healthy',
      docker: 'connected',
    });
  });

  // Docker info
  fastify.get('/info', async (_request, reply) => {
    const info = await getDockerInfo();

    const result: DockerInfo = {
      id: info.ID || '',
      containers: info.Containers,
      containersRunning: info.ContainersRunning,
      containersStopped: info.ContainersStopped,
      containersPaused: info.ContainersPaused,
      images: info.Images,
      driver: info.Driver,
      driverStatus: info.DriverStatus || [],
      dockerRootDir: info.DockerRootDir,
      operatingSystem: info.OperatingSystem,
      architecture: info.Architecture,
      cpus: info.NCPU,
      memoryLimit: info.MemoryLimit,
      swapLimit: info.SwapLimit,
      kernelVersion: info.KernelVersion,
      kernelMemory: info.KernelMemory,
      osType: info.OSType,
      os: info.OperatingSystem,
      name: info.Name,
      serverVersion: info.ServerVersion,
    };

    return reply.send({ success: true, data: result });
  });

  // Docker version
  fastify.get('/version', async (_request, reply) => {
    const version = await getDockerVersion();
    const v = version as unknown as { Version?: string; ApiVersion?: string; GitCommit?: string; GoVersion?: string; Os?: string; Arch?: string; BuildTime?: string };

    const result: DockerVersion = {
      version: v.Version ?? '',
      apiVersion: v.ApiVersion ?? '',
      gitCommit: v.GitCommit ?? '',
      goVersion: v.GoVersion ?? '',
      os: v.Os ?? '',
      arch: v.Arch ?? '',
      buildTime: v.BuildTime ?? '',
    };

    return reply.send({ success: true, data: result });
  });

  // Disk usage
  fastify.get('/df', async (_request, reply) => {
    const docker = getDocker();
    const df = await docker.df();

    const result: DiskUsage = {
      layersSize: df.LayersSize,
      images: (df.Images || []).map((img: { Id?: string; Size?: number; SharedSize?: number; VirtualSize?: number }) => ({
        id: (img.Id ?? '').replace('sha256:', '').substring(0, 12),
        size: img.Size,
        sharedSize: img.SharedSize,
        virtualSize: img.VirtualSize,
      })),
      containers: (df.Containers || []).map((c: { Id?: string; SizeRw?: number; SizeRootFs?: number }) => ({
        id: (c.Id ?? '').replace('sha256:', '').substring(0, 12),
        sizeRw: c.SizeRw,
        sizeRootFs: c.SizeRootFs,
      })),
      volumes: (df.Volumes || []).map((v: { Name?: string; UsageData?: { Size?: number } }) => ({
        name: v.Name,
        size: v.UsageData?.Size || 0,
      })),
    };

    return reply.send({ success: true, data: result });
  });

  // Ping Docker daemon
  fastify.get('/ping', async (_request, reply) => {
    const docker = getDocker();
    const result = await docker.ping();
    return reply.send({ success: true, data: result.toString() });
  });

  // POST /system/upgrade - Trigger DockPilot upgrade via Docker container
  fastify.post<{ Body: z.infer<typeof upgradeBodySchema> }>(
    '/system/upgrade',
    {
      schema: {
        body: upgradeBodySchema,
      },
    },
    async (request, reply) => {
      if (upgradeInProgress) {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'UPGRADE_IN_PROGRESS',
            message: 'An upgrade is already in progress',
            containerId: upgradeContainerId,
            startedAt: upgradeStartedAt,
          },
        });
      }

      const { version } = request.body;
      const docker = getDocker();

      try {
        upgradeInProgress = true;
        upgradeTargetVersion = version;
        upgradeStartedAt = new Date().toISOString();

        const CDN = 'https://raw.githubusercontent.com/marweb/DockerPilot/master/scripts';
        const SOURCE_DIR = process.env.DOCKPILOT_SOURCE_DIR || '/data/dockpilot/source';

        // Pull the docker:latest image (has Docker CLI + Compose)
        fastify.log.info({ version }, 'Pulling docker:latest image for upgrade...');
        await new Promise<void>((resolve, reject) => {
          docker.pull('docker:latest', {}, (err: Error | null, stream: NodeJS.ReadableStream) => {
            if (err) return reject(err);
            docker.modem.followProgress(stream, (err2: Error | null) => {
              if (err2) return reject(err2);
              resolve();
            });
          });
        });

        // Create upgrade container
        fastify.log.info({ version, SOURCE_DIR }, 'Creating upgrade container...');
        const container = await docker.createContainer({
          Image: 'docker:latest',
          name: `dockpilot-upgrader-${Date.now()}`,
          Cmd: [
            'sh',
            '-c',
            [
              'apk add --no-cache curl bash >/dev/null 2>&1',
              `cd "${SOURCE_DIR}"`,
              `export CDN="${CDN}"`,
              `export SOURCE_DIR="${SOURCE_DIR}"`,
              `bash upgrade.sh "${version}"`,
            ].join(' && '),
          ],
          Env: [
            `CDN=${CDN}`,
            `SOURCE_DIR=${SOURCE_DIR}`,
          ],
          HostConfig: {
            Binds: [
              '/var/run/docker.sock:/var/run/docker.sock',
              `${SOURCE_DIR}:${SOURCE_DIR}`,
            ],
            NetworkMode: 'host',
            AutoRemove: true,
          },
          Labels: {
            'dockpilot.upgrader': 'true',
            'dockpilot.upgrade.version': version,
            'dockpilot.upgrade.started': upgradeStartedAt,
          },
        });

        upgradeContainerId = container.id;

        // Start the container (fire and forget - it will recreate all containers including this one)
        await container.start();
        fastify.log.info({ containerId: container.id, version }, 'Upgrade container started');

        return reply.send({
          success: true,
          data: {
            message: `Upgrade to version ${version} initiated`,
            containerId: container.id,
            startedAt: upgradeStartedAt,
          },
        });
      } catch (error) {
        upgradeInProgress = false;
        upgradeContainerId = null;
        upgradeStartedAt = null;
        upgradeTargetVersion = null;

        fastify.log.error(error, 'Failed to start upgrade');
        const err = error as Error;
        return reply.status(500).send({
          success: false,
          error: {
            code: 'UPGRADE_FAILED',
            message: `Failed to start upgrade: ${err.message}`,
          },
        });
      }
    }
  );

  // GET /system/upgrade-status - Check upgrade status
  fastify.get('/system/upgrade-status', async (_request, reply) => {
    if (!upgradeInProgress) {
      return reply.send({
        success: true,
        data: {
          inProgress: false,
        },
      });
    }

    // Check if upgrader container is still running
    const docker = getDocker();
    let containerRunning = false;
    let containerStatus = 'unknown';

    if (upgradeContainerId) {
      try {
        const container = docker.getContainer(upgradeContainerId);
        const info = await container.inspect();
        containerRunning = info.State.Running;
        containerStatus = info.State.Status;

        // If container finished, reset state
        if (!containerRunning) {
          upgradeInProgress = false;
          const exitCode = info.State.ExitCode;
          upgradeContainerId = null;
          upgradeStartedAt = null;

          return reply.send({
            success: true,
            data: {
              inProgress: false,
              completed: exitCode === 0,
              exitCode,
              targetVersion: upgradeTargetVersion,
            },
          });
        }
      } catch {
        // Container not found (removed by AutoRemove), upgrade likely completed
        upgradeInProgress = false;
        upgradeContainerId = null;
        upgradeStartedAt = null;

        return reply.send({
          success: true,
          data: {
            inProgress: false,
            completed: true,
            targetVersion: upgradeTargetVersion,
          },
        });
      }
    }

    return reply.send({
      success: true,
      data: {
        inProgress: true,
        containerId: upgradeContainerId,
        startedAt: upgradeStartedAt,
        targetVersion: upgradeTargetVersion,
        containerStatus,
      },
    });
  });
}
