import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  private normalizeMessage(m: any): string {
    try {
      if (Array.isArray(m)) return m.join('; ');
      if (typeof m === 'string') return m;
      if (m && typeof m === 'object') {
        if ('message' in m) return this.normalizeMessage((m as any).message);
        return JSON.stringify(m);
      }
      return String(m);
    } catch {
      return 'Unexpected error';
    }
  }

  private normalizeDetails(d: any): any {
    try {
      if (d === undefined) return undefined;
      if (typeof d === 'string' || typeof d === 'number' || typeof d === 'boolean') return d;
      return JSON.parse(JSON.stringify(d));
    } catch {
      return undefined;
    }
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode: string | undefined;
    let message = 'Internal server error';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const r: any = res;
        message = this.normalizeMessage(r.message ?? r.error ?? message);
        errorCode = r.code ?? r.errorCode;
        details = this.normalizeDetails(r.details ?? undefined);
      }
    } else if (exception instanceof Error) {
      message = this.normalizeMessage(exception.message);
    }

    const isProd = process.env.NODE_ENV === 'production';
    const showDetails = !isProd || process.env.SHOW_ERROR_DETAILS === 'true';

    const errorId = status >= 500 ? randomUUID() : undefined;

    const body: any = {
      statusCode: status,
      errorCode,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (showDetails || status < 500) {
      body.details = details;
    }

    if (errorId) body.errorId = errorId;

    if (status >= 500) {
      // Log full details + errorId server-side for investigation
      this.logger.error(`errorId=${errorId} body=${JSON.stringify({ ...body, details })}`, exception instanceof Error ? exception.stack : undefined);
    } else {
      this.logger.log(`${status} ${body.message} - ${request.method} ${request.url}`);
    }

    response.status(status).json(body);
  }
}
