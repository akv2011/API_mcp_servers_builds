import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import axios from 'axios';
import * as fuzzysort from 'fuzzysort';
import { TokenData, TokenPriceService } from '../interfaces/token.interface';

// Interface for CoinGecko market chart response
export interface MarketChartResponse {
  prices: [number, number][]; // [timestamp, price]
  market_caps: [number, number][];
  total_volumes: [number, number][];
}

// Interface for page refresh tracking
interface PageRefreshInfo {
  pageNumber: number;
  lastRefreshed: number;
  successCount: number;
  failureCount: number;
}

export interface TokenPlatforms {
  [platform: string]: string; // platform name -> contract address
}

// Update TokenData to include platforms
export interface ExtendedTokenData extends TokenData {
  platforms?: TokenPlatforms;
}

@Injectable()
export class TokenCacheService {
  private readonly logger = new Logger(TokenCacheService.name);
  private readonly BASE_URL = 'https://api.coingecko.com/api/v3';
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 10000; // 10 seconds
  private readonly COOLDOWN_DELAY = 6000; // 6 seconds between requests
  private readonly MAX_PAGES = 10; // 10 pages of 250 tokens = 2500 tokens
  private readonly TOKENS_PER_PAGE = 250; // Number of tokens per page from CoinGecko API

  // Keep track of when each page was last refreshed
  private pageRefreshHistory: PageRefreshInfo[] = [];

  // Cache storage
  private cache: {
    data: ExtendedTokenData[];
    lastUpdated: number;
    bySymbol: Map<string, ExtendedTokenData[]>;
    byName: Map<string, ExtendedTokenData[]>;
    byId: Map<string, ExtendedTokenData>;
    platforms: Map<string, TokenPlatforms>; // id -> platforms mapping
  } = {
    data: [],
    lastUpdated: 0,
    bySymbol: new Map(),
    byName: new Map(),
    byId: new Map(),
    platforms: new Map(),
  };

  constructor(
    @Inject(forwardRef(() => 'TOKEN_PRICE_SERVICE'))
    private readonly priceService: TokenPriceService,
  ) {
    this.initializePageRefreshHistory();
  }

  /**
   * Initialize page refresh history tracking
   */
  private initializePageRefreshHistory(): void {
    this.pageRefreshHistory = Array.from(
      { length: this.MAX_PAGES },
      (_, i) => ({
        pageNumber: i + 1,
        lastRefreshed: 0,
        successCount: 0,
        failureCount: 0,
      }),
    );
  }

  /**
   * Get the timestamp of the last cache update
   */
  get lastUpdated(): number {
    return this.cache.lastUpdated;
  }

  /**
   * Get the number of tokens in the cache
   */
  get tokenCount(): number {
    return this.cache.data.length;
  }

  /**
   * Check if the cache is empty
   */
  get isEmpty(): boolean {
    return this.cache.data.length === 0;
  }

  /**
   * Get detailed cache status including page refresh history
   */
  getDetailedCacheStatus() {
    const basicStatus = this.getCacheStatus();

    return {
      ...basicStatus,
      pagesStatus: this.pageRefreshHistory.map((page) => ({
        pageNumber: page.pageNumber,
        lastRefreshed:
          page.lastRefreshed > 0
            ? new Date(page.lastRefreshed).toISOString()
            : 'never',
        successCount: page.successCount,
        failureCount: page.failureCount,
        ageInMinutes:
          page.lastRefreshed > 0
            ? Math.round((Date.now() - page.lastRefreshed) / (60 * 1000))
            : Infinity,
      })),
    };
  }

  /**
   * Initialize platforms data from CoinGecko
   */
  async initializePlatformsData(): Promise<void> {
    try {
      this.logger.log('Fetching platforms data from CoinGecko...');

      const response = await axios.get(`${this.BASE_URL}/coins/list`, {
        params: {
          include_platform: true,
        },
        timeout: 30000,
      });

      if (response.status === 200 && Array.isArray(response.data)) {
        // Clear existing platforms data
        this.cache.platforms.clear();

        // Store platforms data
        response.data.forEach(
          (coin: { id: string; platforms: TokenPlatforms }) => {
            if (Object.keys(coin.platforms).length > 0) {
              this.cache.platforms.set(coin.id, coin.platforms);
            }
          },
        );

        this.logger.log(
          `Successfully cached platforms data for ${this.cache.platforms.size} tokens`,
        );
      } else {
        throw new Error('Invalid response from CoinGecko platforms API');
      }
    } catch (error) {
      this.logger.error(
        `Failed to initialize platforms data: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Update the token cache every hour
   */
  async updateTokenCache(): Promise<void> {
    const beforeStatus = this.getCacheStatus();
    this.logger.log(
      `Running scheduled token cache update. Current token count: ${beforeStatus.tokenCount}`,
    );

    try {
      // Get pages sorted by last refresh time (oldest first)
      const pagesToRefresh = [...this.pageRefreshHistory].sort(
        (a, b) => a.lastRefreshed - b.lastRefreshed,
      );

      this.logger.log(
        `Beginning cache update. Pages will be processed in order: ${pagesToRefresh.map((p) => p.pageNumber).join(', ')}`,
      );

      let mergedPages = 0;

      // Fetch pages in order from least recently updated to most recently updated
      for (const pageInfo of pagesToRefresh) {
        const page = pageInfo.pageNumber;
        let retries = 0;
        let success = false;

        while (!success && retries < this.MAX_RETRIES) {
          try {
            this.logger.log(
              `Fetching tokens - page ${page}/${this.MAX_PAGES} (attempt ${retries + 1})`,
            );

            const response = await axios.get(`${this.BASE_URL}/coins/markets`, {
              params: {
                vs_currency: 'usd',
                order: 'market_cap_desc',
                per_page: this.TOKENS_PER_PAGE,
                page: page,
                sparkline: false,
              },
              timeout: 30000,
            });

            if (response.status === 200 && Array.isArray(response.data)) {
              // Process and index the new tokens from this page
              const newTokens = response.data.map((token: TokenData) => {
                // Add platforms data if available
                const platforms = this.cache.platforms.get(token.id);
                return {
                  ...token,
                  platforms: platforms || {},
                };
              });

              // Update the main data array
              // Remove any existing tokens from this page range (250 tokens per page)
              const startIndex = (page - 1) * this.TOKENS_PER_PAGE;
              const endIndex = startIndex + this.TOKENS_PER_PAGE;
              this.cache.data = [
                ...this.cache.data.slice(0, startIndex),
                ...newTokens,
                ...this.cache.data.slice(endIndex),
              ];

              // Update indices for the new tokens
              newTokens.forEach((token) => {
                // Index by symbol (lowercase for case-insensitive search)
                const symbol = token.symbol.trim().toLowerCase();
                if (!this.cache.bySymbol.has(symbol)) {
                  this.cache.bySymbol.set(symbol, []);
                }
                // Remove any existing entries for this token and add the new one
                this.cache.bySymbol.set(symbol, [
                  ...this.cache.bySymbol
                    .get(symbol)!
                    .filter((t) => t.id !== token.id),
                  token,
                ]);

                // Index by name (lowercase for case-insensitive search)
                const name = token.name.trim().toLowerCase();
                if (!this.cache.byName.has(name)) {
                  this.cache.byName.set(name, []);
                }
                // Remove any existing entries for this token and add the new one
                this.cache.byName.set(name, [
                  ...this.cache.byName
                    .get(name)!
                    .filter((t) => t.id !== token.id),
                  token,
                ]);

                // Index by id (replace existing entry if any)
                this.cache.byId.set(token.id, token);
              });

              success = true;
              mergedPages++;

              // Update page refresh history
              pageInfo.lastRefreshed = Date.now();
              pageInfo.successCount++;

              // Update the cache's last updated timestamp
              this.cache.lastUpdated = Date.now();

              this.logger.log(
                `Successfully fetched and indexed page ${page} with ${newTokens.length} tokens. Total tokens in cache: ${this.cache.data.length}`,
              );
            } else {
              throw new Error(`Invalid response for page ${page}`);
            }
          } catch (error) {
            retries++;
            pageInfo.failureCount++;
            const isRateLimit = error.response?.status === 429;

            this.logger.warn(
              `Error fetching page ${page} (attempt ${retries}): ${
                isRateLimit ? 'Rate limit exceeded' : error.message
              }`,
            );

            if (retries >= this.MAX_RETRIES) {
              this.logger.error(
                `Max retries reached for page ${page}, moving on`,
              );
              break;
            }

            // Wait longer if rate limited
            const delay = isRateLimit ? this.RETRY_DELAY * 2 : this.RETRY_DELAY;
            this.logger.log(`Waiting ${delay / 1000} seconds before retry...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }

        // Cooldown between successful requests to avoid rate limiting
        if (pageInfo !== pagesToRefresh[pagesToRefresh.length - 1]) {
          this.logger.log(
            `Cooling down for ${this.COOLDOWN_DELAY / 1000} seconds to avoid rate limiting`,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, this.COOLDOWN_DELAY),
          );
        }
      }

      this.logger.log(
        `Successfully processed ${mergedPages} of ${this.MAX_PAGES} pages. Total tokens in cache: ${this.cache.data.length}`,
      );

      if (this.cache.data.length === 0) {
        throw new Error('Failed to fetch any tokens after all retries');
      }
    } catch (error) {
      this.logger.error(`Failed to update token cache: ${error.message}`);
      throw error;
    }
  }

  /**
   * Unified search method that can find tokens by symbol, name, or contract address
   * @param query The search query
   * @param searchType The type of search to perform ('symbol' | 'name' | 'address' | undefined)
   * @param updatePrice Whether to fetch real-time price data
   */
  async findToken(
    query: string,
    searchType?: 'symbol' | 'name' | 'address',
    updatePrice: boolean = false,
  ): Promise<ExtendedTokenData | null> {
    if (this.isEmpty) {
      this.logger.debug('Cache is empty, returning null');
      return null;
    }

    try {
      // Normalize query
      const normalizedQuery = query.trim().toLowerCase();
      this.logger.debug(
        `Unified token search - Query: "${normalizedQuery}", Type: ${searchType || 'auto'} (updatePrice: ${updatePrice})`,
      );

      // If search type is address or the query looks like an address (0x...), search by contract
      if (
        searchType === 'address' ||
        (!searchType && normalizedQuery.startsWith('0x'))
      ) {
        return this.getTokenByContractAddress(normalizedQuery, updatePrice);
      }

      // Try exact matches based on search type
      if (searchType === 'symbol' || !searchType) {
        const symbolMatches = this.cache.bySymbol.get(normalizedQuery);
        if (symbolMatches?.length) {
          const bestMatch = symbolMatches.sort(
            (a, b) => b.market_cap - a.market_cap,
          )[0];
          this.logger.debug(`Found exact symbol match: ${bestMatch.symbol}`);
          return updatePrice ? this.updateTokenPrice(bestMatch) : bestMatch;
        }
      }

      if (searchType === 'name' || !searchType) {
        const nameMatches = this.cache.byName.get(normalizedQuery);
        if (nameMatches?.length) {
          const bestMatch = nameMatches.sort(
            (a, b) => b.market_cap - a.market_cap,
          )[0];
          this.logger.debug(`Found exact name match: ${bestMatch.name}`);
          return updatePrice ? this.updateTokenPrice(bestMatch) : bestMatch;
        }
      }

      // If no exact matches and fuzzy search is allowed (only for symbol and name searches)
      if (!searchType || searchType === 'symbol' || searchType === 'name') {
        // Prepare data for fuzzy search
        const searchTargets = this.cache.data.map((token) => ({
          token,
          symbolTarget:
            searchType !== 'name'
              ? fuzzysort.prepare(String(token.symbol))
              : null,
          nameTarget:
            searchType !== 'symbol'
              ? fuzzysort.prepare(String(token.name))
              : null,
        }));

        const results: Array<{ token: ExtendedTokenData; score: number }> = [];

        // Search by symbol if allowed
        if (searchType !== 'name') {
          const symbolResults = fuzzysort.go(normalizedQuery, searchTargets, {
            key: 'symbolTarget',
            limit: 10,
            threshold: -5000,
          });
          results.push(
            ...symbolResults.map((result) => ({
              token: result.obj.token,
              score: result.score,
            })),
          );
        }

        // Search by name if allowed
        if (searchType !== 'symbol') {
          const nameResults = fuzzysort.go(normalizedQuery, searchTargets, {
            key: 'nameTarget',
            limit: 10,
            threshold: -5000,
          });
          results.push(
            ...nameResults.map((result) => ({
              token: result.obj.token,
              score: result.score,
            })),
          );
        }

        // Combine and sort results based on score first, then market cap
        const sortedResults = results
          .filter(
            (item, index, self) =>
              index === self.findIndex((t) => t.token.id === item.token.id),
          )
          // Sort primarily by score (descending, higher score is better)
          // Then by market cap (descending) as a tie-breaker
          .sort((a, b) => {
            if (a.score !== b.score) {
              return b.score - a.score; // Higher score first
            }
            return b.token.market_cap - a.token.market_cap; // Higher market cap first
          });

        // Define a minimum acceptable score threshold for fuzzy matches
        const FUZZY_SCORE_THRESHOLD = -1000; // Closer to 0 is better

        // Get the best result based on score and market cap
        const bestResult = sortedResults[0];
        this.logger.debug(
          `Best result: ${bestResult?.token?.symbol}: ${bestResult?.score}`,
        );

        if (bestResult && bestResult.score >= FUZZY_SCORE_THRESHOLD) {
          const bestMatch = bestResult.token;
          this.logger.debug(
            `Found best fuzzy match: ${bestMatch.symbol} (${bestMatch.name}) with score ${bestResult.score}`,
          );
          return updatePrice ? this.updateTokenPrice(bestMatch) : bestMatch;
        } else if (bestResult) {
          // Log if the best result didn't meet the score threshold
          this.logger.debug(
            `Best fuzzy match ${bestResult.token.symbol} (${bestResult.token.name}) score ${bestResult.score} was below threshold ${FUZZY_SCORE_THRESHOLD}`,
          );
        }
      }

      this.logger.debug('No suitable matches found');
      return null;
    } catch (error) {
      this.logger.error(`Error in findToken: ${error.message}`);
      throw error;
    }
  }

  /**
   * Helper method to update token price using PriceService
   */
  private async updateTokenPrice(
    token: ExtendedTokenData,
  ): Promise<ExtendedTokenData> {
    this.logger.debug(`Updating price for token: ${token.symbol}`);
    try {
      const priceBigInt = await this.priceService.getTokenPriceFromCache(
        token.symbol,
      );
      if (priceBigInt > 0n) {
        const newPrice = Number(priceBigInt) / 1e8;
        this.logger.debug(
          `Updated price for ${token.symbol}: ${token.current_price} -> ${newPrice}`,
        );
        token.current_price = newPrice;
        token.last_updated = new Date().toISOString();
      } else {
        this.logger.debug(
          `No price update available for ${token.symbol} (received price: ${priceBigInt})`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to fetch real-time price for ${token.symbol}, using cached price: ${error.message}`,
      );
    }
    return token;
  }

  /**
   * Get cache status information
   */
  getCacheStatus() {
    const now = Date.now();
    const cacheAge = now - this.cache.lastUpdated;

    return {
      tokenCount: this.cache.data.length,
      lastUpdated: new Date(this.cache.lastUpdated).toISOString(),
      cacheAge: `${Math.round(cacheAge / (60 * 1000))} minutes`,
      isEmpty: this.isEmpty,
      isStale: cacheAge > 60 * 60 * 1000, // 1 hour
      platformsCount: this.cache.platforms.size,
    };
  }

  /**
   * Find a token by its contract address on any platform
   * @param address The contract address to search for
   * @param updatePrice Whether to fetch the latest price
   * @returns The token data if found, null otherwise
   */
  async getTokenByContractAddress(
    address: string,
    updatePrice: boolean = false,
  ): Promise<ExtendedTokenData | null> {
    this.logger.debug(`Searching for token with address: ${address}`);

    // Normalize address for case-insensitive comparison
    const normalizedAddress = address.toLowerCase();

    // Search through all tokens in the platforms cache
    for (const [tokenId, platforms] of this.cache.platforms.entries()) {
      // Check all platforms for an exact match
      for (const contractAddress of Object.values(platforms)) {
        if (contractAddress.toLowerCase() === normalizedAddress) {
          const token = this.cache.byId.get(tokenId);
          if (token) {
            this.logger.debug(
              `Found token ${token.symbol} (${token.name}) for address ${address}`,
            );
            return updatePrice ? await this.updateTokenPrice(token) : token;
          }
        }
      }
    }

    this.logger.debug(`No token found for address ${address}`);
    return null;
  }

  /**
   * Fetches historical market data for a specific token from CoinGecko.
   *
   * @param tokenId - The CoinGecko ID of the token (e.g., 'bitcoin').
   * @param days - The number of days to fetch historical data for.
   * @param currency - The currency to get the price in (defaults to 'usd').
   * @returns The market chart data or null if an error occurs.
   */
  async getHistoricalPriceData(
    tokenId: string,
    days: number,
    currency: string = 'usd',
  ): Promise<MarketChartResponse | null> {
    this.logger.debug(
      `Fetching historical price data for token ID: ${tokenId}, days: ${days}, currency: ${currency}`,
    );

    try {
      const response = await axios.get<MarketChartResponse>(
        `${this.BASE_URL}/coins/${tokenId}/market_chart`,
        {
          params: {
            vs_currency: currency,
            days: days,
            precision: 'full', // Request full precision
          },
          timeout: 30000, // 30 second timeout
        },
      );

      if (response.status === 200 && response.data) {
        this.logger.log(
          `Successfully fetched historical data for ${tokenId} (${response.data.prices.length} price points)`, // Log length of prices array
        );
        return response.data;
      } else {
        this.logger.warn(
          `Received non-200 status (${response.status}) or empty data while fetching historical data for ${tokenId}`,
        );
        return null;
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message;
      this.logger.error(
        `Error fetching historical price data for ${tokenId}: ${errorMessage}`,
      );
      // Rethrow or return null based on desired error handling
      // For now, returning null to indicate failure without crashing
      return null;
    }
  }
}
