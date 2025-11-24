import { BuildSpec } from '../ai/schema';
import { broadcast } from '../ws/websocket';
import prisma from '../db/client';
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

const getPackageManager = (base: string) => {
    switch (base) {
        case 'arch':
            return {
                image: 'archlinux:latest',
                installCmd: 'pacman -Syu --noconfirm',
                packages: [], // Archiso is not needed for the Docker image
            };
        case 'ubuntu':
            return {
                image: `ubuntu:${process.env.UBUNTU_VERSION || '22.04'}`,
                installCmd: 'apt-get update && apt-get install -y',
                packages: ['systemd'],
            };
        case 'debian':
            return {
                image: `debian:${process.env.DEBIAN_VERSION || 'bookworm'}`,
                installCmd: 'apt-get update && apt-get install -y',
                packages: ['systemd'],
            };
        default:
            throw new Error(`Unsupported base distribution: ${base}`);
    }
};

const generateDockerfile = (spec: BuildSpec): string => {
    const { image, installCmd, packages: basePackages } = getPackageManager(spec.base);

    const allPackages = [
        ...basePackages,
        spec.kernel,
        ...Object.values(spec.desktop),
        ...spec.packages.system,
        ...spec.packages.dev,
        ...spec.packages.network_security,
        ...spec.packages.utils,
        ...spec.packages.multimedia,
        ...spec.packages.browsers,
    ].filter(Boolean).join(' ');

    let dockerfile = `FROM ${image}\n\n`;
    dockerfile += `RUN ${installCmd} ${allPackages}\n\n`;

    // Add security configurations
    if (spec.security.ufw_default_on) {
        dockerfile += 'RUN ufw enable\n';
    }
    // Note: Other security/defaults are complex and better handled by configuration management
    // within the running container, but this demonstrates the principle.

    dockerfile += `CMD ["/bin/bash"]\n`;

    return dockerfile;
};

export const runBuildLifecycle = async (spec: BuildSpec, buildId: string) => {
    const { DOCKERHUB_USERNAME, DOCKERHUB_TOKEN, DOCKERHUB_REPO } = process.env;
    if (!DOCKERHUB_USERNAME || !DOCKERHUB_TOKEN || !DOCKERHUB_REPO) {
        throw new Error('Docker Hub credentials are not set in the environment variables.');
    }

    const artifactsPath = path.resolve(process.cwd(), 'artifacts', buildId);
    const workspacePath = path.join('/tmp', `build-${buildId}`);

    const log = async (message: string) => {
        console.log(`[Build ${buildId}] ${message}`);
        await prisma.buildLog.create({ data: { buildId, message } });
        broadcast(buildId, message);
    };

    const updateStatus = async (status: string) => {
        await prisma.build.update({ where: { id: buildId }, data: { status } });
    };

    try {
        await fs.mkdir(workspacePath, { recursive: true });
        await updateStatus('building');
        await log('Starting build...');
        await log(`Base distribution: ${spec.base}`);

        await log('Generating dynamic Dockerfile...');
        const dockerfileContent = generateDockerfile(spec);
        await fs.writeFile(path.join(workspacePath, 'Dockerfile'), dockerfileContent);
        await log('Dockerfile generated successfully.');
        await log('--- Dockerfile Content ---');
        await log(dockerfileContent);
        await log('--------------------------');


        await log('Building final OS image...');
        const imageName = `${DOCKERHUB_REPO}:${buildId}`;
        const buildCommand = `docker build -t ${imageName} ${workspacePath}`;
        // Use a streaming approach for build logs later if needed
        const { stdout, stderr } = await execAsync(buildCommand);
        await log(stdout);
        if (stderr) {
            await log(`Build stderr: ${stderr}`);
        }
        await log('OS Image built successfully.');

        await log('Logging in to Docker Hub...');
        const loginCommand = `echo "${DOCKERHUB_TOKEN}" | docker login -u ${DOCKERHUB_USERNAME} --password-stdin`;
        await execAsync(loginCommand);

        await log('Pushing image to Docker Hub...');
        const pushCommand = `docker push ${imageName}`;
        await execAsync(pushCommand);
        await log(`Image pushed to docker.io/${imageName}`);

        const imageUrl = `docker.io/${imageName}`;

        // Conditional ISO Generation for Arch Linux
        let isoPath: string | null = null;
        if (spec.base === 'arch') {
            await log('Base is Arch Linux, starting ISO generation...');
            isoPath = await buildArchIso(spec, buildId, workspacePath, artifactsPath, log);
            await log(`ISO artifact saved to ${isoPath}`);
        }

        await prisma.build.update({
            where: { id: buildId },
            data: { imageUrl, isoPath },
        });

        await updateStatus('complete');
        await log('Build complete!');
    } catch (error) {
        console.error(`Error during build ${buildId}:`, error);
        await updateStatus('failed');
        const errorMessage = error instanceof Error ? error.message : 'Build failed with an unknown error.';
        await log(errorMessage);
    } finally {
        await log('Cleaning up workspace...');
        await fs.rm(workspacePath, { recursive: true, force: true });
        try {
            const imageName = `${DOCKERHUB_REPO}:${buildId}`;
            await execAsync(`docker rmi ${imageName}`);
            await log(`Removed local Docker image: ${imageName}`);
        } catch (error) {
            if (error instanceof Error) {
                await log(`Failed to remove local Docker image: ${error.message}`);
            } else {
                await log('Failed to remove local Docker image with an unknown error.');
            }
        }
        await log('Cleanup complete.');
    }
};

const buildArchIso = async (spec: BuildSpec, buildId: string, workspacePath: string, artifactsPath: string, log: (message: string) => Promise<void>): Promise<string> => {
    const isoWorkspacePath = path.join(workspacePath, 'iso');
    const outPath = path.join(isoWorkspacePath, 'out');
    await fs.mkdir(isoWorkspacePath, { recursive: true });
    await fs.mkdir(outPath, { recursive: true });

    const dockerfileContent = `
FROM archlinux:latest
WORKDIR /workspace
COPY install.sh .
RUN chmod +x install.sh
CMD ["/bin/bash", "install.sh"]
`;

    const installScriptContent = `
#!/bin/bash
set -ex
pacman -Syu --noconfirm
pacman -S --noconfirm archiso
# --- ISO Artifact Generation ---
# Create a temporary archiso profile
mkdir -p /workspace/iso_profile
cp -r /usr/share/archiso/configs/releng/* /workspace/iso_profile/
# Write packages to the profile
# This will overwrite the default package list
cat <<EOF > /workspace/iso_profile/packages.x86_64
${spec.kernel}
${Object.values(spec.desktop).join('\n')}
${spec.packages.system.join('\n')}
${spec.packages.dev.join('\n')}
${spec.packages.network_security.join('\n')}
${spec.packages.utils.join('\n')}
${spec.packages.multimedia.join('\n')}
${spec.packages.browsers.join('\n')}
xorg-server
xorg-xinit
xorg-apps
fluxbox
x11vnc
novnc
EOF
# Create a script to be run inside the chroot
cat <<EOF > /workspace/iso_profile/airootfs/root/configure-iso.sh
#!/bin/bash
set -ex
# Set up user
useradd -m user
echo "user:user" | chpasswd
usermod -aG wheel user
# Desktop environment
if [ "${spec.desktop.display_server}" = "wayland" ]; then
  pacman -S --noconfirm sway waybar rofi-wayland foot mako swaylock-effects
fi
# Security
if [ "${spec.security.full_disk_encryption}" = "true" ]; then
  # This is a complex task that requires user interaction during installation.
  # We will just install the necessary tools.
  pacman -S --noconfirm cryptsetup
fi
if [ "${spec.security.secure_boot}" = "true" ]; then
  pacman -S --noconfirm sbctl
fi
if [ "${spec.security.apparmor_profiles}" = "true" ]; then
  pacman -S --noconfirm apparmor
  systemctl enable apparmor
fi
if [ "${spec.security.ufw_default_on}" = "true" ]; then
  pacman -S --noconfirm ufw
  ufw enable
fi
if [ "${spec.security.auto_security_updates}" = "true" ]; then
  cat <<'EOT' > /etc/systemd/system/pacman-update.service
[Unit]
Description=Update Arch Linux system
[Service]
Type=oneshot
ExecStart=/usr/bin/pacman -Syu --noconfirm
EOT
  cat <<'EOT' > /etc/systemd/system/pacman-update.timer
[Unit]
Description=Run pacman-update.service daily
[Timer]
OnCalendar=daily
Persistent=true
[Install]
WantedBy=timers.target
EOT
  systemctl enable pacman-update.timer
fi
# Defaults
echo "vm.swappiness=${spec.defaults.swappiness}" > /etc/sysctl.d/99-swappiness.conf
if [ "${spec.defaults.ssd_trim}" = "true" ]; then
  systemctl enable fstrim.timer
fi
if [ -n "${spec.defaults.kernel_params}" ]; then
    sed -i 's/GRUB_CMDLINE_LINUX_DEFAULT="\\(.*\\)"/GRUB_CMDLINE_LINUX_DEFAULT="\\1 ${spec.defaults.kernel_params}"/' /etc/default/grub
    grub-mkconfig -o /boot/grub/grub.cfg
fi
if [ "${spec.defaults.doh}" = "true" ]; then
    # This is a complex task that requires configuring a DNS resolver.
    # We will just install the necessary tools.
    pacman -S --noconfirm systemd-resolvconf
fi
if [ "${spec.defaults.mac_randomization}" = "true" ]; then
    # This is a complex task that requires configuring NetworkManager.
    # We will just install the necessary tools.
    pacman -S --noconfirm networkmanager
fi
EOF
chmod +x /workspace/iso_profile/airootfs/root/configure-iso.sh
# Create the ISO
mkarchiso -v -w /workspace/work -o /workspace/out -r '/root/configure-iso.sh' /workspace/iso_profile
`;

    await fs.writeFile(path.join(isoWorkspacePath, 'Dockerfile'), dockerfileContent);
    await fs.writeFile(path.join(isoWorkspacePath, 'install.sh'), installScriptContent);

    await log('Building ISO builder image...');
    const buildImageCommand = `docker build -t iso-builder-${buildId} ${isoWorkspacePath}`;
    const { stdout: buildImageStdout, stderr: buildImageStderr } = await execAsync(buildImageCommand);
    await log(buildImageStdout);
    if (buildImageStderr) {
        await log(`Build image stderr: ${buildImageStderr}`);
    }

    await log('Running ISO build container...');
    const runContainerCommand = `docker run --name iso-builder-${buildId} -v ${isoWorkspacePath}:/workspace iso-builder-${buildId}`;
    const { stdout: runContainerStdout, stderr: runContainerStderr } = await execAsync(runContainerCommand);
    await log(runContainerStdout);
    if (runContainerStderr) {
        await log(`Run container stderr: ${runContainerStderr}`);
    }

    const files = await fs.readdir(outPath);
    const isoFile = files.find(file => file.endsWith('.iso'));
    if (!isoFile) {
        throw new Error('Could not find ISO file in output directory');
    }
    const isoPath = path.join(artifactsPath, isoFile);
    await fs.rename(path.join(outPath, isoFile), isoPath);

    await log('Cleaning up ISO builder...');
    await execAsync(`docker rm -f iso-builder-${buildId}`);
    await execAsync(`docker rmi iso-builder-${buildId}`);

    return isoPath;
};
