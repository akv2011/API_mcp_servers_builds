import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { MorphoModule } from '../morpho/morpho.module';
import { MarketsController } from './markets.controller';
import { MarketsService } from './markets.service';
import { AaveModule } from 'src/aave/aave.module';
import { MarketsTool } from './tools/markets.tool';

@Module({
  imports: [
    MorphoModule,
    AaveModule,
    CacheModule.register({
      ttl: 6 * 60 * 60, // 6 hours in seconds
      max: 100, // maximum number of items in cache
    }),
  ],
  controllers: [MarketsController],
  providers: [MarketsService, MarketsTool],
  exports: [MarketsService],
})
export class MarketsModule {}
