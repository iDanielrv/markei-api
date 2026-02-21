import { HttpException } from '@nestjs/common';

export class ApplicationException extends HttpException {
  public readonly code?: string;
  public readonly details?: any;

  constructor(message: string | string[], status: number, code?: string, details?: any) {
    super({ message, code, details }, status);
    this.code = code;
    this.details = details;
  }
}
