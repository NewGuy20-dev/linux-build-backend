import { BuildSpec } from '../ai/schema';

/**
 * Produce a Borg backup configuration block based on the provided build spec.
 *
 * Generates a shell-compatible configuration and backup function that sets BORG_REPO,
 * a passphrase placeholder, retention variables, and a backup/prune script using
 * values from `spec.backup`. If `spec.backup` is missing or `backup.tool` is not `"borg"`,
 * an empty string is returned.
 *
 * @param spec - Build specification whose `backup` field supplies tool, destinations, and retention settings
 * @returns A multi-line Borg configuration string, or an empty string when Borg is not configured
 */
export function generateBorgConfig(spec: BuildSpec): string {
  const backup = spec.backup;
  if (!backup || backup.tool !== 'borg') return '';

  const retention = backup.retention || { daily: 7, weekly: 4, monthly: 12 };
  const destinations = backup.destinations || ['local'];

  return `# Borg Backup Configuration
BORG_REPO="${destinations[0] === 'local' ? '/var/backup/borg' : destinations[0]}"
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
 * Generate a Restic backup configuration block from a BuildSpec.
 *
 * @param spec - Build specification that may include a `backup` configuration
 * @returns The Restic configuration and backup script as a string when `spec.backup.tool` is `"restic"`, otherwise an empty string
 */
export function generateResticConfig(spec: BuildSpec): string {
  const backup = spec.backup;
  if (!backup || backup.tool !== 'restic') return '';

  const retention = backup.retention || { daily: 7, weekly: 4, monthly: 12 };
  const destinations = backup.destinations || ['local'];

  return `# Restic Backup Configuration
RESTIC_REPOSITORY="${destinations[0] === 'local' ? '/var/backup/restic' : destinations[0]}"
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
 * Generate the appropriate backup tool configuration snippet from a BuildSpec.
 *
 * @param spec - Build specification containing an optional `backup` section; when `backup.enabled` is truthy and `backup.tool` is set to a supported tool, its configuration is produced.
 * @returns The generated backup configuration text for the chosen tool (`borg` or `restic`), or an empty string if backup is disabled or the tool is unsupported.
 */
export function generateBackupConfig(spec: BuildSpec): string {
  if (!spec.backup?.enabled) return '';
  
  if (spec.backup.tool === 'borg') return generateBorgConfig(spec);
  if (spec.backup.tool === 'restic') return generateResticConfig(spec);
  return '';
}

/**
 * Generate a crontab snippet that schedules the backup script based on the build spec.
 *
 * Uses `spec.backup.schedule` to choose the schedule: `'weekly'` maps to `0 2 * * 0` (Sundays at 02:00), all other values map to `0 2 * * *` (daily at 02:00).
 *
 * @param spec - The BuildSpec whose `backup` settings determine whether a cron entry is produced and which schedule to use.
 * @returns A multiline crontab entry that comments the chosen schedule and runs `/usr/local/bin/backup.sh` as `root`, or an empty string if backups are disabled.
 */
export function generateBackupCron(spec: BuildSpec): string {
  if (!spec.backup?.enabled) return '';
  
  const schedule = spec.backup.schedule === 'weekly' ? '0 2 * * 0' : '0 2 * * *';
  return `# Backup schedule (${spec.backup.schedule})
${schedule} root /usr/local/bin/backup.sh
`;
}