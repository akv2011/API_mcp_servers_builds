import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MorphoModule } from './morpho/morpho.module';
import { DatabaseModule } from './database';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MarketsModule } from './markets/markets.module';
import { PositionsModule } from './positions/positions.module';
import { AaveModule } from './aave/aave.module';
import { McpModule } from '@rekog/mcp-nest';
import { YieldModule } from './yield/yield.module';
import { PriceModule } from './price';
import { ChainModule } from './chain';
import { TokenModule } from './token';
import { HyperliquidModule } from './hyperliquid/hyperliquid.module';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyGuard } from './common/guards/api-key.guard';
import { ApiKeyService } from './common/services/api-key.service';

@Module({
  imports: [
    ConfigModule.forRoot(),
    DatabaseModule,
    MorphoModule,
    MarketsModule,
    PositionsModule,
    AaveModule,
    McpModule.forRoot({
      name: 'matrix',
      version: '1.0.0',
    }),
    PriceModule,
    ChainModule,
    TokenModule,
    YieldModule,
    HyperliquidModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    ApiKeyService,
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AppModule {}
