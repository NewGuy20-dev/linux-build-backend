import * as core from '@actions/core';
import * as fs from 'fs';

interface BuildResponse {
  buildId: string;
  spec?: any;
}

interface StatusResponse {
  status: string;
  downloadUrls?: {
    dockerImage?: string;
    dockerTarDownloadUrl?: string;
    isoDownloadUrl?: string;
  };
}

interface ComplianceResponse {
  profile: string;
  passed: boolean;
  score: number;
}

async function run(): Promise<void> {
  try {
    const apiKey = core.getInput('api-key', { required: true });
    const specFile = core.getInput('spec-file');
    const apiUrl = core.getInput('api-url');
    const wait = core.getInput('wait') === 'true';
    const timeout = parseInt(core.getInput('timeout'), 10) || 1800;
    const compliance = core.getInput('compliance');

    // Read spec file
    if (!fs.existsSync(specFile)) {
      throw new Error(`Spec file not found: ${specFile}`);
    }
    const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
    core.info(`Loaded build spec from ${specFile}`);

    // Start build
    core.info('Starting build...');
    const startRes = await fetch(`${apiUrl}/api/build/start`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(spec),
    });

    if (!startRes.ok) {
      throw new Error(`Failed to start build: ${startRes.statusText}`);
    }

    const buildData: BuildResponse = await startRes.json();
    const buildId = buildData.buildId;
    core.setOutput('build-id', buildId);
    core.info(`Build started: ${buildId}`);

    if (!wait) {
      core.info('Not waiting for build completion');
      return;
    }

    // Poll for completion
    const startTime = Date.now();
    let status = 'PENDING';

    while (Date.now() - startTime < timeout * 1000) {
      const statusRes = await fetch(`${apiUrl}/api/build/status/${buildId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      if (!statusRes.ok) {
        throw new Error(`Failed to get status: ${statusRes.statusText}`);
      }

      const statusData: StatusResponse = await statusRes.json();
      status = statusData.status;
      core.info(`Build status: ${status}`);

      if (['SUCCESS', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) {
        core.setOutput('status', status);

        if (statusData.downloadUrls?.dockerImage) {
          core.setOutput('docker-image', statusData.downloadUrls.dockerImage);
        }
        if (statusData.downloadUrls?.isoDownloadUrl) {
          core.setOutput('iso-url', `${apiUrl}${statusData.downloadUrls.isoDownloadUrl}`);
        }
        break;
      }

      await new Promise((r) => setTimeout(r, 10000)); // Poll every 10s
    }

    if (!['SUCCESS', 'COMPLETED'].includes(status)) {
      if (status === 'FAILED') {
        core.setFailed('Build failed');
      } else if (status === 'CANCELLED') {
        core.setFailed('Build was cancelled');
      } else {
        core.setFailed(`Build timed out after ${timeout}s`);
      }
      return;
    }

    // Run compliance check if requested
    if (compliance) {
      core.info(`Running ${compliance} compliance check...`);
      const compRes = await fetch(`${apiUrl}/api/compliance/check/${buildId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ profile: compliance }),
      });

      if (compRes.ok) {
        const compData: ComplianceResponse = await compRes.json();
        core.setOutput('compliance-score', compData.score.toString());
        core.info(`Compliance score: ${compData.score}% (${compData.passed ? 'PASSED' : 'FAILED'})`);

        if (!compData.passed) {
          core.warning(`Compliance check failed: score ${compData.score}% below 80% threshold`);
        }
      }
    }

    core.info('Build completed successfully');
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('Unknown error occurred');
    }
  }
}

run();
