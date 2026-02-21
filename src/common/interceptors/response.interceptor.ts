import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { Request } from 'express';

@Injectable()
export class ResponseTransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse();

    return next.handle().pipe(
      map((data) => {
        // If the route already returns a standardized envelope, pass through
        if (data && typeof data === 'object' && ('statusCode' in data || 'data' in data)) {
          return data;
        }

        const status = response?.statusCode ?? 200;

        return {
          statusCode: status,
          data: data === undefined ? null : data,
          path: request?.url,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
