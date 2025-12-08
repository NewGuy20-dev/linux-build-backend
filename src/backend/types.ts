import { BuildSpec } from '../ai/schema';

export interface BuildResponse {
  buildId: string;
}

export interface Backend {
  build(spec: BuildSpec): Promise<BuildResponse>;
  getStatus(buildId: string): Promise<unknown>;
  getLogs(buildId: string): Promise<unknown>;
}
