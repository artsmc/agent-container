import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DbClient } from '../../db/client';
import type { NormalizedTranscript } from '@iexcel/shared-types';
import { ApiError, ForbiddenError } from '../../errors/api-errors';
import {
  isValidUuid,
  isValidIso8601Datetime,
  isValidCallType,
  isAllowedFileExtension,
  isAllowedMimeType,
  isWithinFileSizeLimit,
  MIN_TRANSCRIPT_LENGTH,
  postTranscriptJsonBodySchema,
  type CallTypeValue,
} from '../../validators/transcript-validators';
import { getClientById, writeAuditLog } from '../../services/client-service';
import { normalizeTextTranscript } from '../../normalizers/text/index.js';
import { NormalizerError } from '../../normalizers/text/index.js';
import { insertTranscript } from '../../repositories/transcript-repository';
import { buildTranscriptAuditMetadata } from '../../services/transcript-types';
import type { MeetingType } from '@iexcel/shared-types';

// ---------------------------------------------------------------------------
// Error factories
// ---------------------------------------------------------------------------

function invalidIdError(): ApiError {
  return new ApiError(400, 'INVALID_ID', 'The provided ID is not a valid UUID.');
}

function clientNotFoundError(): ApiError {
  return new ApiError(
    404,
    'CLIENT_NOT_FOUND',
    'The requested client does not exist or you do not have access to it.'
  );
}

function invalidBodyError(message: string): ApiError {
  return new ApiError(400, 'INVALID_BODY', message);
}

function unsupportedFileTypeError(): ApiError {
  return new ApiError(
    400,
    'UNSUPPORTED_FILE_TYPE',
    'Only .txt (text/plain) files are supported.'
  );
}

function fileTooLargeError(): ApiError {
  return new ApiError(
    400,
    'FILE_TOO_LARGE',
    'File size exceeds the 5 MB limit.'
  );
}

// ---------------------------------------------------------------------------
// Multipart body field type
// ---------------------------------------------------------------------------

interface MultipartField {
  type: 'field';
  fieldname: string;
  value: string;
}

interface MultipartFile {
  type: 'file';
  fieldname: string;
  filename: string;
  mimetype: string;
  toBuffer(): Promise<Buffer>;
}

type MultipartPart = MultipartField | MultipartFile;

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export function registerPostTranscript(
  fastify: FastifyInstance,
  db: DbClient
): void {
  fastify.post(
    '/clients/:clientId/transcripts',
    async (
      request: FastifyRequest<{ Params: { clientId: string } }>,
      reply: FastifyReply
    ) => {
      const { clientId } = request.params;
      const user = request.user!;

      // 1. Validate UUID
      if (!isValidUuid(clientId)) {
        throw invalidIdError();
      }

      // 2. Role check: team members cannot submit
      if (user.role === 'team_member') {
        throw new ForbiddenError(
          'Team members are not permitted to submit transcripts.'
        );
      }

      // 3. Access check
      const client = await getClientById(db, clientId, user.id, user.role);
      if (!client) {
        throw clientNotFoundError();
      }

      // 4. Detect content type and extract fields
      const contentType = request.headers['content-type'] ?? '';
      let rawText: string | undefined;
      let callType: string | undefined;
      let callDate: string | undefined;
      let submissionMethod: 'json' | 'file_upload' = 'json';

      if (contentType.includes('multipart/form-data')) {
        // --- Multipart form-data path ---
        submissionMethod = 'file_upload';
        let hasFile = false;
        let hasRawTranscript = false;

        const parts = request.parts() as AsyncIterable<MultipartPart>;
        for await (const part of parts) {
          if (part.type === 'file' && part.fieldname === 'file') {
            hasFile = true;
            const filePart = part as MultipartFile;

            // Validate MIME type and extension
            if (
              !isAllowedMimeType(filePart.mimetype) &&
              !isAllowedFileExtension(filePart.filename)
            ) {
              throw unsupportedFileTypeError();
            }

            const buffer = await filePart.toBuffer();

            // Validate file size
            if (!isWithinFileSizeLimit(buffer.byteLength)) {
              throw fileTooLargeError();
            }

            // Decode UTF-8
            try {
              rawText = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
            } catch {
              throw invalidBodyError(
                'File content could not be decoded as UTF-8.'
              );
            }
          } else if (part.type === 'field') {
            const fieldPart = part as MultipartField;
            if (fieldPart.fieldname === 'call_type') {
              callType = fieldPart.value;
            } else if (fieldPart.fieldname === 'call_date') {
              callDate = fieldPart.value;
            } else if (fieldPart.fieldname === 'raw_transcript') {
              hasRawTranscript = true;
            }
          }
        }

        // Mutual exclusion check
        if (hasFile && hasRawTranscript) {
          throw invalidBodyError(
            'Provide either raw_transcript or file, not both.'
          );
        }
        if (!hasFile && !hasRawTranscript) {
          throw invalidBodyError(
            'Either raw_transcript or file must be provided.'
          );
        }
      } else {
        // --- JSON body path ---
        const bodyResult = postTranscriptJsonBodySchema.safeParse(request.body);
        if (!bodyResult.success) {
          const firstIssue = bodyResult.error.issues[0];
          throw invalidBodyError(
            firstIssue?.message ?? 'Invalid request body.'
          );
        }

        rawText = bodyResult.data.raw_transcript;
        callType = bodyResult.data.call_type;
        callDate = bodyResult.data.call_date;
      }

      // 5. Validate call_type
      if (!callType || !isValidCallType(callType)) {
        throw invalidBodyError(
          'call_type must be one of: client_call, intake, follow_up.'
        );
      }

      // 6. Validate call_date
      if (!callDate || !isValidIso8601Datetime(callDate)) {
        throw invalidBodyError(
          'call_date must be a valid ISO 8601 datetime string.'
        );
      }

      // 7. Validate raw text presence and length
      if (!rawText || rawText.trim().length < MIN_TRANSCRIPT_LENGTH) {
        throw invalidBodyError(
          `Transcript text must be at least ${MIN_TRANSCRIPT_LENGTH} characters.`
        );
      }

      // 8. Normalize the transcript
      let normalizedSegments: NormalizedTranscript;
      try {
        normalizedSegments = normalizeTextTranscript({
          rawText,
          callType: callType as MeetingType,
          callDate,
          clientId,
        });
      } catch (error: unknown) {
        if (error instanceof NormalizerError) {
          throw invalidBodyError(error.message);
        }
        throw error;
      }

      // 9. Insert transcript row
      const record = await insertTranscript(db, {
        clientId,
        callType: callType as CallTypeValue,
        callDate,
        rawTranscript: rawText,
        normalizedSegments,
      });

      // 10. Write audit log (non-blocking)
      const auditMetadata = buildTranscriptAuditMetadata(
        callType,
        callDate,
        normalizedSegments,
        rawText.length,
        submissionMethod
      );

      writeAuditLog(db, {
        userId: user.id,
        action: 'transcript.created',
        entityType: 'transcript',
        entityId: record.id,
        metadata: auditMetadata as unknown as Record<string, unknown>,
        source: 'ui',
      }).catch((auditError: unknown) => {
        request.log.warn(
          { transcriptId: record.id, error: auditError },
          'Failed to write audit log for transcript creation'
        );
      });

      // 11. Return created record
      void reply.status(201).send(record);
    }
  );
}
