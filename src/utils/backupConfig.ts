import { BuildSpec } from '../ai/schema';

// Validate backup destinations: local paths, rsync URLs, s3:// URLs
const LOCAL_PATH = /^\/[a-zA-Z0-9._\-\/]+$/;
const RSYNC_URL = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+:[a-zA-Z0-9._\-\/]+$/;
const S3_URL = /^s3:\/\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._\-\/]*$/;

/**
 * Checks whether a backup destination string is a valid local path, rsync-style destination, or S3 URL.
 *
 * @param dest - Destination string to validate (e.g., absolute local path, "user@host:path", or "s3://bucket/path")
 * @returns `true` if `dest` matches a supported destination pattern, `false` otherwise.
 */
function validateBackupDestination(dest: string): boolean {
  return LOCAL_PATH.test(dest) || RSYNC_URL.test(dest) || S3_URL.test(dest);
}

/**
 * Normalize and validate a backup destination string.
 *
 * @param dest - Destination identifier or URL: the literal 'local', an absolute local path (e.g. `/...`), an rsync-style destination (`user@host:path`), or an `s3://` URL.
 * @returns The sanitized destination string (`/var/backup` when `dest` is `'local'`, otherwise the original validated destination).
 * @throws Error if `dest` is not a recognized or valid backup destination.
 */
function sanitizeDestination(dest: string): string {
  if (dest === 'local') return '/var/backup';
  if (!validateBackupDestination(dest)) {
    throw new Error(`Invalid backup destination: ${dest}`);
  }
  return dest;
}

/**
 * Generate a shell configuration and backup function for Borg from the provided build spec.
 *
 * If `spec.backup` is missing or its `tool` is not `'borg'`, an empty string is returned.
 *
 * @param spec - Build specification containing `backup` settings (destinations, retention, schedule, and sources) used to derive repository path, retention variables, and the backup/ prune commands.
 * @returns A string containing a Borg shell configuration: `BORG_REPO`, a `BORG_PASSPHRASE` placeholder, retention variables (`KEEP_DAILY`, `KEEP_WEEKLY`, `KEEP_MONTHLY`), and a `backup()` shell function that runs `borg create` for configured sources and `borg prune` with the retention limits; or an empty string when Borg is not enabled.
 */
export function generateBorgConfig(spec: BuildSpec): string {
  const backup = spec.backup;
  if (!backup || backup.tool !== 'borg') return '';

  const retention = backup.retention || { daily: 7, weekly: 4, monthly: 12 };
  const destinations = backup.destinations || ['local'];
  const safeDest = sanitizeDestination(destinations[0]);

  return `# Borg Backup Configuration
BORG_REPO="${safeDest === '/var/backup' ? '/var/backup/borg' : safeDest}"
BORG_PASSPHRASE=""  # Set via environment variable

# Retention policy
KEEP_DAILY=${retention.daily}
KEEP_WEEKLY=${retention.weekly}
KEEP_MONTHLY=${retention.monthly}

# Backup script
backup() {
  borg create --stats --progress \\
    $BORG_REPO::'{hostname}-{now}' \\
    /home /etc /var/log \\
    --exclude '*.cache' \\
    --exclude '/home/*/.cache'
  
  borg prune --stats \\
    --keep-daily=$KEEP_DAILY \\
    --keep-weekly=$KEEP_WEEKLY \\
    --keep-monthly=$KEEP_MONTHLY \\
    $BORG_REPO
}
`;
}

/**
 * Generate a shell configuration and backup function for Restic from the given build spec.
 *
 * The function reads retention and destination settings from `spec.backup`, applying defaults
 * when those fields are absent (daily: 7, weekly: 4, monthly: 12; destinations: ['local']).
 *
 * @param spec - Build specification containing an optional `backup` section that configures Restic.
 * @returns The Restic-related shell configuration and backup function as a string, or an empty string if the spec does not request Restic.
 * @throws Error if the selected backup destination is invalid or cannot be sanitized.
 */
export function generateResticConfig(spec: BuildSpec): string {
  const backup = spec.backup;
  if (!backup || backup.tool !== 'restic') return '';

  const retention = backup.retention || { daily: 7, weekly: 4, monthly: 12 };
  const destinations = backup.destinations || ['local'];
  const safeDest = sanitizeDestination(destinations[0]);

  return `# Restic Backup Configuration
RESTIC_REPOSITORY="${safeDest === '/var/backup' ? '/var/backup/restic' : safeDest}"
RESTIC_PASSWORD_FILE="/etc/restic/password"

# Retention policy
KEEP_DAILY=${retention.daily}
KEEP_WEEKLY=${retention.weekly}
KEEP_MONTHLY=${retention.monthly}

# Backup script
backup() {
  restic backup /home /etc /var/log \\
    --exclude='*.cache' \\
    --exclude='/home/*/.cache'
  
  restic forget \\
    --keep-daily $KEEP_DAILY \\
    --keep-weekly $KEEP_WEEKLY \\
    --keep-monthly $KEEP_MONTHLY \\
    --prune
}
`;
}

/**
 * Generate the backup tool configuration snippet from the build specification.
 *
 * @param spec - BuildSpec containing optional `backup` settings (e.g., `enabled`, `tool`, `destinations`, and `retention`)
 * @returns The generated configuration string for the selected backup tool, or an empty string if backups are disabled or the tool is unsupported.
 */
export function generateBackupConfig(spec: BuildSpec): string {
  if (!spec.backup?.enabled) return '';
  
  if (spec.backup.tool === 'borg') return generateBorgConfig(spec);
  if (spec.backup.tool === 'restic') return generateResticConfig(spec);
  return '';
}

/**
 * Produce a cron snippet that schedules the system backup script according to the build spec.
 *
 * @param spec - Build specification containing `backup.enabled` and optional `backup.schedule`. If `backup.schedule` is `'weekly'` the snippet schedules backups weekly at 02:00 on Sunday; otherwise it schedules daily at 02:00.
 * @returns A cron file snippet that runs `/usr/local/bin/backup.sh` as root using the configured schedule, or an empty string if backups are disabled.
 */
export function generateBackupCron(spec: BuildSpec): string {
  if (!spec.backup?.enabled) return '';
  
  const schedule = spec.backup.schedule === 'weekly' ? '0 2 * * 0' : '0 2 * * *';
  return `# Backup schedule (${spec.backup.schedule})
${schedule} root /usr/local/bin/backup.sh
`;
}