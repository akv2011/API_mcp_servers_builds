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
  private supabaseAdmin: SupabaseClient;
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get('UPLINK_SUPABASE_URL');
    const supabaseServiceRoleKey = this.configService.get(
      'UPLINK_SUPABASE_SERVICE_ROLE_KEY',
    );
    this.logger.log(`Supabase URL: ${supabaseUrl}`);
    this.logger.log(`Supabase Key: ${supabaseServiceRoleKey}`);

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error(
        'Supabase credentials not found in environment. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      );
    }

    this.logger.log(
      `Initializing ApiKeyService with Supabase Admin client at ${supabaseUrl}`,
    );

    // Initialize Supabase Admin client with service role key for API key validation
    this.supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  async validateApiKey(apiKey: string): Promise<ApiKey | null> {
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
