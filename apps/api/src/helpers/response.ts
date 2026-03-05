import type { FastifyReply } from 'fastify';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

interface PaginatedMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: PaginatedMeta;
}

/**
 * Sends a standard success response envelope.
 *
 * ```json
 * { "success": true, "data": <T> }
 * ```
 */
export function sendSuccess<T>(
  reply: FastifyReply,
  data: T,
  statusCode = 200
): void {
  const body: SuccessResponse<T> = { success: true, data };
  void reply.status(statusCode).send(body);
}

/**
 * Sends a paginated success response envelope.
 *
 * ```json
 * {
 *   "success": true,
 *   "data": [...],
 *   "pagination": { "total": N, "page": N, "pageSize": N, "totalPages": N }
 * }
 * ```
 */
export function sendPaginated<T>(
  reply: FastifyReply,
  data: T[],
  total: number,
  page: number,
  pageSize: number
): void {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;

  const body: PaginatedResponse<T> = {
    success: true,
    data,
    pagination: {
      total,
      page,
      pageSize,
      totalPages,
    },
  };

  void reply.status(200).send(body);
}
