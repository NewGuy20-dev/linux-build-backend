export interface DockerLimits {
  memory: string;      // e.g., '2g'
  memorySwap: string;  // e.g., '2g' (same as memory = no swap)
  cpus: number;        // e.g., 2
  pidsLimit: number;   // e.g., 100
  timeout: number;     // seconds
}

export const DEFAULT_LIMITS: DockerLimits = {
  memory: '2g',
  memorySwap: '2g',
  cpus: 2,
  pidsLimit: 100,
  timeout: 1800, // 30 minutes
};

export const getLimitsForTier = (tier: 'free' | 'standard' | 'premium' = 'free'): DockerLimits => {
  const tiers: Record<string, DockerLimits> = {
    free: DEFAULT_LIMITS,
    standard: { memory: '4g', memorySwap: '4g', cpus: 4, pidsLimit: 200, timeout: 3600 },
    premium: { memory: '8g', memorySwap: '8g', cpus: 8, pidsLimit: 500, timeout: 7200 },
  };
  return tiers[tier] ?? DEFAULT_LIMITS;
};

export const toDockerRunArgs = (limits: DockerLimits): string[] => [
  `--memory=${limits.memory}`,
  `--memory-swap=${limits.memorySwap}`,
  `--cpus=${limits.cpus}`,
  `--pids-limit=${limits.pidsLimit}`,
];
