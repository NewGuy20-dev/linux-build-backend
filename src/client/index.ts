import { BuildSpec } from '../ai/schema';
import backend, { Backend, BuildResponse } from '../backend';

export class NeonClient {
  constructor(private readonly backendImpl: Backend = backend) {}

  async build(spec: BuildSpec): Promise<BuildResponse> {
    return this.backendImpl.build(spec);
  }

  async getStatus(buildId: string): Promise<unknown> {
    return this.backendImpl.getStatus(buildId);
  }

  async getLogs(buildId: string): Promise<unknown> {
    return this.backendImpl.getLogs(buildId);
  }
}

const neonClient = new NeonClient();

export default neonClient;
