import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TokenCacheService } from './token-cache.service';

@Injectable()
export class TokenCronService implements OnModuleInit {
  private readonly logger = new Logger(TokenCronService.name);

  constructor(private readonly tokenCacheService: TokenCacheService) {}

  /**
   * Initialize the cache when the module starts
   */
  async onModuleInit() {
    this.logger.log('Initializing token cache...');

    try {
      // First fetch platforms data
      await this.tokenCacheService.initializePlatformsData();
      this.logger.log('Platforms data initialized');

      // Then update the token cache in background
      this.updateTokenCache()
        .then(() => this.logger.log('Initial token cache update completed'))
        .catch((error) =>
          this.logger.error(
            `Initial token cache update failed: ${error.message}`,
          ),
        );

      this.logger.log(
        'Server starting while token cache initializes in background',
      );
    } catch (error) {
      this.logger.error(`Cache initialization failed: ${error.message}`);
      // We don't throw here to allow the server to start even if initialization fails
      // The hourly cron job will retry later
    }
  }

  /**
   * Update the token cache every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async updateTokenCache() {
    const beforeStatus = this.tokenCacheService.getDetailedCacheStatus();
    this.logger.log(
      `Running scheduled token cache update. Current token count: ${beforeStatus.tokenCount}`,
    );

    try {
      await this.tokenCacheService.updateTokenCache();

      const afterStatus = this.tokenCacheService.getDetailedCacheStatus();
      this.logger.log(
        `Scheduled token cache update completed successfully. Updated token count: ${afterStatus.tokenCount}`,
      );

      // Log page update summary
      if (afterStatus.pagesStatus) {
        const pagesSummary = afterStatus.pagesStatus
          .sort(
            (a: { pageNumber: number }, b: { pageNumber: number }) =>
              a.pageNumber - b.pageNumber,
          )
          .map(
            (page: { pageNumber: any; ageInMinutes: any }) =>
              `Page ${page.pageNumber}: ${page.ageInMinutes} mins ago`,
          );

        this.logger.log(`Page refresh status: ${pagesSummary.join(' | ')}`);
      }
    } catch (error) {
      this.logger.error(
        `Scheduled token cache update failed: ${error.message}`,
      );
    }
  }
}
