export interface TokenData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  image: string;
  last_updated: string;
  [key: string]: any;
}

export interface TokenPriceService {
  getTokenPriceFromCache(symbol: string): Promise<bigint>;
}
