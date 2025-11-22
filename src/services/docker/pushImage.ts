import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function pushImage(localName: string, buildId: string): Promise<string> {
  const { DOCKERHUB_USERNAME, DOCKERHUB_TOKEN, DOCKERHUB_REPO } = process.env;

  if (!DOCKERHUB_USERNAME || !DOCKERHUB_TOKEN || !DOCKERHUB_REPO) {
    throw new Error('Docker Hub credentials are not set in the environment variables.');
  }

  const imageUrl = `docker.io/${DOCKERHUB_USERNAME}/${DOCKERHUB_REPO}:${buildId}`;

  try {
    console.log(`Logging in to Docker Hub...`);
    await execAsync(`echo "${DOCKERHUB_TOKEN}" | docker login --username "${DOCKERHUB_USERNAME}" --password-stdin`);

    console.log(`Tagging image ${localName} as ${imageUrl}...`);
    await execAsync(`docker tag ${localName} ${imageUrl}`);

    console.log(`Pushing image ${imageUrl} to Docker Hub...`);
    await execAsync(`docker push ${imageUrl}`);

    console.log(`Successfully pushed image ${imageUrl}`);
    return imageUrl;
  } catch (error) {
    console.error(`Failed to push image to Docker Hub:`, error);
    throw new Error('Failed to push image to Docker Hub.');
  }
}
