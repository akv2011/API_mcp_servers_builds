import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyService } from '../services/api-key.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Request } from 'express';

interface RequestWithApiKey extends Request {
  apiKeyData?: any;
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private reflector: Reflector,
    private apiKeyService: ApiKeyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Skip validation for public routes
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithApiKey>();
    const apiKey = this.extractApiKey(request);

    if (!apiKey) {
      throw new UnauthorizedException('API key is missing');
    }

    const validApiKey = await this.apiKeyService.validateApiKey(apiKey);

    if (!validApiKey) {
      throw new UnauthorizedException('Invalid or revoked API key');
    }

    // Store the API key data in the request for later use
    request.apiKeyData = validApiKey;
    return true;
  }

  private extractApiKey(request: RequestWithApiKey): string | undefined {
    // Check authorization header first (preferred method)
    const authHeader = request.headers.authorization;
    if (authHeader) {
      // Fix for double Bearer prefix (from Swagger UI)
      if (authHeader.startsWith('Bearer Bearer ')) {
        return authHeader.substring(14); // Remove "Bearer Bearer "
      }
      
      // Handle standard 'Bearer TOKEN' format
      if (authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
      }
      
      // If no Bearer prefix, use the entire header value
      return authHeader;
    }
    
    // Fallback: Check in x-api-key header
    const apiKey = request.headers['x-api-key'] as string | undefined;
    if (apiKey) {
      return apiKey;
    }

    // Fallback: Check in query parameters
    if (request.query && request.query.api_key) {
      return request.query.api_key as string;
    }

    return undefined;
  }
}
