import { logger } from '../utils/logger';
import { checkCancellation } from '../utils/cancellation';

export interface BuildStep {
  id: string;
  name: string;
  dependencies: string[];
  execute: () => Promise<void>;
  weight?: number; // Estimated duration weight for scheduling
}

export interface ParallelBuildOptions {
  maxConcurrency?: number;
  onStepStart?: (step: BuildStep) => void;
  onStepComplete?: (step: BuildStep, duration: number) => void;
  onStepError?: (step: BuildStep, error: Error) => void;
}

interface StepState {
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime?: number;
  duration?: number;
  error?: Error;
}

export class ParallelBuildExecutor {
  private steps: Map<string, BuildStep> = new Map();
  private state: Map<string, StepState> = new Map();
  private options: Required<ParallelBuildOptions>;
  private buildId: string;

  constructor(buildId: string, options: ParallelBuildOptions = {}) {
    this.buildId = buildId;
    this.options = {
      maxConcurrency: options.maxConcurrency ?? 4,
      onStepStart: options.onStepStart ?? (() => {}),
      onStepComplete: options.onStepComplete ?? (() => {}),
      onStepError: options.onStepError ?? (() => {}),
    };
  }

  addStep(step: BuildStep): void {
    this.steps.set(step.id, step);
    this.state.set(step.id, { status: 'pending' });
  }

  addSteps(steps: BuildStep[]): void {
    steps.forEach((s) => this.addStep(s));
  }

  private canRun(step: BuildStep): boolean {
    return step.dependencies.every((dep) => {
      const depState = this.state.get(dep);
      return depState?.status === 'completed';
    });
  }

  private getReadySteps(): BuildStep[] {
    const ready: BuildStep[] = [];
    for (const [id, step] of this.steps) {
      const state = this.state.get(id);
      if (state?.status === 'pending' && this.canRun(step)) {
        ready.push(step);
      }
    }
    // Sort by weight (heavier tasks first for better scheduling)
    return ready.sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));
  }

  private getRunningCount(): number {
    let count = 0;
    for (const state of this.state.values()) {
      if (state.status === 'running') count++;
    }
    return count;
  }

  async execute(): Promise<{ success: boolean; totalDuration: number; stepResults: Map<string, StepState> }> {
    const startTime = Date.now();
    const running: Map<string, Promise<void>> = new Map();

    logger.info({ buildId: this.buildId, steps: this.steps.size }, 'Starting parallel build');

    while (true) {
      await checkCancellation(this.buildId);

      // Check if all steps are done
      const allDone = [...this.state.values()].every(
        (s) => s.status === 'completed' || s.status === 'failed'
      );
      if (allDone) break;

      // Start ready steps up to concurrency limit
      const ready = this.getReadySteps();
      const available = this.options.maxConcurrency - this.getRunningCount();

      for (let i = 0; i < Math.min(ready.length, available); i++) {
        const step = ready[i];
        this.state.set(step.id, { status: 'running', startTime: Date.now() });
        this.options.onStepStart(step);

        const promise = this.runStep(step);
        running.set(step.id, promise);
      }

      // Wait for at least one step to complete
      if (running.size > 0) {
        await Promise.race(running.values());
        
        // Clean up completed promises
        for (const [id, promise] of running) {
          const state = this.state.get(id);
          if (state?.status !== 'running') {
            running.delete(id);
          }
        }
      } else if (ready.length === 0 && this.getRunningCount() === 0) {
        // No ready steps and nothing running - check for dependency failures
        const hasPending = [...this.state.values()].some((s) => s.status === 'pending');
        if (hasPending) {
          logger.error({ buildId: this.buildId }, 'Deadlock detected - pending steps with failed dependencies');
          break;
        }
      }
    }

    const totalDuration = Date.now() - startTime;
    const success = [...this.state.values()].every((s) => s.status === 'completed');

    logger.info({ buildId: this.buildId, success, duration: totalDuration }, 'Parallel build completed');

    return { success, totalDuration, stepResults: new Map(this.state) };
  }

  private async runStep(step: BuildStep): Promise<void> {
    const startTime = Date.now();
    try {
      await step.execute();
      const duration = Date.now() - startTime;
      this.state.set(step.id, { status: 'completed', startTime, duration });
      this.options.onStepComplete(step, duration);
      logger.debug({ buildId: this.buildId, step: step.id, duration }, 'Step completed');
    } catch (error) {
      const duration = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));
      this.state.set(step.id, { status: 'failed', startTime, duration, error: err });
      this.options.onStepError(step, err);
      logger.error({ buildId: this.buildId, step: step.id, error: err.message }, 'Step failed');
    }
  }
}

// Helper to create common build steps
export const createBuildSteps = (buildId: string, spec: any): BuildStep[] => {
  return [
    {
      id: 'validate',
      name: 'Validate Spec',
      dependencies: [],
      weight: 1,
      execute: async () => {
        logger.debug({ buildId }, 'Validating spec');
      },
    },
    {
      id: 'resolve-packages',
      name: 'Resolve Packages',
      dependencies: ['validate'],
      weight: 2,
      execute: async () => {
        logger.debug({ buildId }, 'Resolving packages');
      },
    },
    {
      id: 'generate-dockerfile',
      name: 'Generate Dockerfile',
      dependencies: ['resolve-packages'],
      weight: 1,
      execute: async () => {
        logger.debug({ buildId }, 'Generating Dockerfile');
      },
    },
    {
      id: 'generate-configs',
      name: 'Generate Configs',
      dependencies: ['validate'],
      weight: 1,
      execute: async () => {
        logger.debug({ buildId }, 'Generating configs');
      },
    },
    {
      id: 'docker-build',
      name: 'Docker Build',
      dependencies: ['generate-dockerfile', 'generate-configs'],
      weight: 10,
      execute: async () => {
        logger.debug({ buildId }, 'Building Docker image');
      },
    },
    {
      id: 'generate-iso',
      name: 'Generate ISO',
      dependencies: ['docker-build'],
      weight: 8,
      execute: async () => {
        logger.debug({ buildId }, 'Generating ISO');
      },
    },
  ];
};
