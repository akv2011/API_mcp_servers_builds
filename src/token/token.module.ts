import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TokenCacheService } from './services/token-cache.service';
import { TokenCronService } from './services/token-cron.service';
import { TokenController } from './controllers/token.controller';
import { TokenTool } from './tools/token.tool';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { PriceModule } from '../price/price.module';
import { TokenBalanceService } from './services/token-balance.service';
import { TokenApprovalService } from './services/token-approval.service';
import { ChainModule } from 'src/chain';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule,
    HttpModule,
    forwardRef(() => PriceModule),
    ChainModule,
  ],
  controllers: [TokenController],
  providers: [
    TokenCacheService,
    TokenCronService,
    TokenTool,
    TokenBalanceService,
    TokenApprovalService,
  ],
  exports: [TokenCacheService, TokenBalanceService, TokenApprovalService],
})
export class TokenModule {}
