import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getChainConfig } from '../utils/chain.utils';
import { PublicClient, createPublicClient, http } from 'viem';
import { SupportedChain } from '../types/chain.type';
@Injectable()
export class ChainService {
  private readonly clients: Map<SupportedChain, PublicClient> = new Map();
  private readonly logger = new Logger(ChainService.name);

  constructor(private readonly configService: ConfigService) {}

  getPublicClient(chain: SupportedChain): PublicClient {
    let client = this.clients.get(chain);
    if (!client) {
      client = this.createPublicClient(chain);
      this.clients.set(chain, client);
    }
    return client;
  }

  getChainId(chain: SupportedChain): number {
    const chainConfig = getChainConfig(chain);
    return chainConfig.id;
  }

  private createPublicClient(chain: SupportedChain): PublicClient {
    const chainConfig = getChainConfig(chain);
    const rpcUrl = this.getRpcUrl(chain);

    this.logger.log(
      `Creating public client for chain ${chain} with RPC URL: ${rpcUrl || 'undefined'}`,
    );

    if (!rpcUrl) {
      this.logger.warn(
        `No RPC URL found for chain ${chain}. Check environment variables.`,
      );
    }

    return createPublicClient({
      chain: chainConfig,
      transport: http(rpcUrl),
    });
  }

  private getRpcUrl(chain: SupportedChain): string | undefined {
    const normalizedChain = chain.replace(/-/g, '_');
    const envKey = `${normalizedChain.toUpperCase()}_RPC_URL`;
    const customRpcUrl = this.configService.get<string>(envKey);

    this.logger.log(
      `Looking up RPC URL for chain ${chain} with env key ${envKey}: ${customRpcUrl ? 'Found' : 'Not found'}`,
    );

    return customRpcUrl;
  }

  getClient(chain: SupportedChain): PublicClient {
    return this.getPublicClient(chain);
  }
}
