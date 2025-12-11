export interface DockerSecurityOptions {
  noNewPrivileges: boolean;
  readOnlyRootfs: boolean;
  dropCapabilities: string[];
  seccompProfile: string;
  user: string;
}

export interface DockerResourceLimits {
  memory: string;
  cpus: string;
  pidsLimit: number;
  networkMode: 'none' | 'bridge' | 'host';
}

export const DEFAULT_SECURITY: DockerSecurityOptions = {
  noNewPrivileges: true,
  readOnlyRootfs: false, // builds need to write
  dropCapabilities: ['ALL'],
  seccompProfile: 'default',
  user: '1000:1000',
};

export const DOCKER_LIMITS: DockerResourceLimits = {
  memory: process.env.DOCKER_MEMORY_LIMIT || '2g',
  cpus: process.env.DOCKER_CPU_LIMIT || '2',
  pidsLimit: parseInt(process.env.DOCKER_PIDS_LIMIT || '100', 10),
  networkMode: 'none',
};

export const toSecurityArgs = (opts: DockerSecurityOptions): string[] => {
  const args: string[] = [];
  
  if (opts.noNewPrivileges) args.push('--security-opt=no-new-privileges:true');
  if (opts.readOnlyRootfs) args.push('--read-only');
  if (opts.dropCapabilities.length) args.push(`--cap-drop=${opts.dropCapabilities.join(',')}`);
  if (opts.seccompProfile) args.push(`--security-opt=seccomp=${opts.seccompProfile}`);
  if (opts.user) args.push(`--user=${opts.user}`);
  
  return args;
};

// Get docker run args with resource limits
export const getDockerRunArgs = (buildId: string): string[] => [
  '--rm',
  `--memory=${DOCKER_LIMITS.memory}`,
  `--cpus=${DOCKER_LIMITS.cpus}`,
  `--pids-limit=${DOCKER_LIMITS.pidsLimit}`,
  `--network=${DOCKER_LIMITS.networkMode}`,
  '--security-opt=no-new-privileges:true',
  `--label=build-id=${buildId}`,
];

// Combined args for docker run with comprehensive security
export const getDockerSecurityArgs = (): string[] => [
  '--security-opt=no-new-privileges:true',
  '--cap-drop=ALL',
  '--cap-add=CHOWN',
  '--cap-add=SETUID',
  '--cap-add=SETGID',
  '--cap-add=DAC_OVERRIDE',
  `--network=${DOCKER_LIMITS.networkMode}`,
  `--memory=${DOCKER_LIMITS.memory}`,
  `--cpus=${DOCKER_LIMITS.cpus}`,
  `--pids-limit=${DOCKER_LIMITS.pidsLimit}`,
  '--tmpfs=/tmp:noexec,nosuid,size=100m',
];
