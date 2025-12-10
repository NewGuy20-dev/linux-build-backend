import { BuildSpec } from '../ai/schema';

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

export function generateBackupConfig(spec: BuildSpec): string {
  if (!spec.backup?.enabled) return '';
  
  if (spec.backup.tool === 'borg') return generateBorgConfig(spec);
  if (spec.backup.tool === 'restic') return generateResticConfig(spec);
  return '';
}

export function generateBackupCron(spec: BuildSpec): string {
  if (!spec.backup?.enabled) return '';
  
  const schedule = spec.backup.schedule === 'weekly' ? '0 2 * * 0' : '0 2 * * *';
  return `# Backup schedule (${spec.backup.schedule})
${schedule} root /usr/local/bin/backup.sh
`;
}
