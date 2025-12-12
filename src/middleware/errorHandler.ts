import { Request, Response, NextFunction } from 'express';

// Sanitize error messages for production
export const sanitizeError = (error: Error): string => {
  // Generic messages for common error types
  if (error.name === 'ValidationError' || error.name === 'ZodError') {
    return 'Invalid request data';
  }
  if (error.name === 'PrismaClientKnownRequestError') {
    return 'Database operation failed';
  }
  if (error.message?.includes('ENOENT')) {
    return 'Resource not found';
  }
  if (error.message?.includes('EACCES') || error.message?.includes('EPERM')) {
    return 'Access denied';
  }
  return 'An unexpected error occurred';
};

// Global error handler middleware
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err);

  const isDev = process.env.NODE_ENV === 'development';
  const statusCode = (err as any).statusCode || 500;

  res.status(statusCode).json({
    error: isDev ? err.message : sanitizeError(err),
    ...(isDev && { stack: err.stack }),
  });
};

// Helper to send safe error responses
export const sendError = (
  res: Response,
  statusCode: number,
  publicMessage: string,
  internalError?: Error
): void => {
  if (internalError) {
    console.error(`[ERROR] ${publicMessage}:`, internalError);
  }
  
  const isDev = process.env.NODE_ENV === 'development';
  res.status(statusCode).json({
    error: publicMessage,
    ...(isDev && internalError && { details: internalError.message }),
  });
};
