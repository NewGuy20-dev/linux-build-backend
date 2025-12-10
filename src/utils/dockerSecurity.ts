export interface DockerSecurityOptions {
  noNewPrivileges: boolean;
  readOnlyRootfs: boolean;
  dropCapabilities: string[];
  seccompProfile: string;
  user: string;
}

export const DEFAULT_SECURITY: DockerSecurityOptions = {
  noNewPrivileges: true,
  readOnlyRootfs: false, // builds need to write
  dropCapabilities: ['ALL'],
  seccompProfile: 'default',
  user: '1000:1000',
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

// Combined args for docker run with comprehensive security
export const getDockerSecurityArgs = (): string[] => [
  '--security-opt=no-new-privileges:true',
  '--cap-drop=ALL',
  '--cap-add=CHOWN',
  '--cap-add=SETUID',
  '--cap-add=SETGID',
  '--cap-add=DAC_OVERRIDE',
  '--network=none',
  '--memory=512m',
  '--memory-swap=512m',
  '--cpus=1.0',
  '--pids-limit=100',
  '--tmpfs=/tmp:noexec,nosuid,size=100m',
];
