import { SupportedChain } from '../types/chain.type';

export class MarketSearchQueryDto {
  chain?: SupportedChain;
  protocol?: string;
  poolId?: string;
  collateralTokenSymbol?: string;
  borrowTokenSymbol?: string;
  limit?: number;
  sortBy?: 'supply_apy' | 'borrow_apy';
}
