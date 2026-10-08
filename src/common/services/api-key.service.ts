import { createHash, timingSafeEqual } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';

export type ApiKey = {
  id: string;
  name: string;
  key: string;
  created_at: string;
  user_id: string;
  status: 'active' | 'revoked';
  last_used?: string;
};

@Injectable()
export class ApiKeyService {
  private supabaseAdmin: SupabaseClient | null = null;
  private readonly localKey: string | undefined;
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get('UPLINK_SUPABASE_URL');
    const supabaseServiceRoleKey = this.configService.get(
      'UPLINK_SUPABASE_SERVICE_ROLE_KEY',
    );
    this.localKey = this.configService.get<string>('MCP_API_KEY') || undefined;

    if (supabaseUrl && supabaseServiceRoleKey) {
      this.supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    } else if (!this.localKey) {
      throw new Error(
        'Set UPLINK_SUPABASE_URL and UPLINK_SUPABASE_SERVICE_ROLE_KEY, or MCP_API_KEY for a single local key.',
      );
    }
  }

  async validateApiKey(apiKey: string): Promise<ApiKey | null> {
    if (this.localKey && sameSecret(apiKey, this.localKey)) {
      return {
        id: 'local',
        name: 'MCP_API_KEY',
        key: '',
        created_at: new Date(0).toISOString(),
        user_id: 'local',
        status: 'active',
      };
    }
    if (!this.supabaseAdmin) {
      return null;
    }
    this.logger.debug(`Validating API key: ${apiKey.substring(0, 8)}...`);

    try {
      this.logger.debug(
        `Querying 'api_keys' table for key matching: ${apiKey.substring(0, 8)}... with status 'active'`,
      );

      const { data, error } = await this.supabaseAdmin
        .from('api_keys')
        .select('*')
        .eq('key', apiKey)
        .eq('status', 'active')
        .single();

      if (error) {
        this.logger.error(
          `Supabase error during API key validation: ${error.message}`,
        );
        // Add more error details for debugging
        this.logger.error(`Full error: ${JSON.stringify(error)}`);
        return null;
      }

      if (!data) {
        this.logger.warn(
          `No API key found matching: ${apiKey.substring(0, 8)}...`,
        );
        return null;
      }

      this.logger.debug(`Valid API key found for user: ${data.user_id}`);
      return data as ApiKey;
    } catch (e) {
      this.logger.error(
        `Unexpected error during API key validation: ${e.message}`,
      );
      // Add stack trace for better debugging
      this.logger.error(`Stack trace: ${e.stack}`);
      return null;
    }
  }
}

// Hashing first gives equal-length buffers, so the comparison time does not reveal the key's length or prefix.
function sameSecret(given: string, expected: string): boolean {
  const digest = (v: string) => createHash('sha256').update(v).digest();
  return timingSafeEqual(digest(given), digest(expected));
}
