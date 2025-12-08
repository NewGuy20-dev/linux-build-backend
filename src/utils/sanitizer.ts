export const sanitizePackageName = (packageName: string): string => {
  // Allow alphanumeric characters, hyphens, underscores, and dots.
  return packageName.replace(/[^a-zA-Z0-9\-_.]/g, '');
};

export const sanitizeCommand = (command: string): string => {
  // Remove newlines to prevent Dockerfile injection
  return command.replace(/[\n\r]/g, '');
};
