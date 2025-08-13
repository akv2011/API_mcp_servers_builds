import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { PriceFeedService } from './services/price-feed.service';
import { PriceService } from './services/price.service';
import { TokenModule } from '../token/token.module';

@Module({
  imports: [ConfigModule, HttpModule, forwardRef(() => TokenModule)],
  providers: [
    PriceFeedService,
    PriceService,
    {
      provide: 'TOKEN_PRICE_SERVICE',
      useExisting: PriceService,
    },
  ],
  exports: [PriceFeedService, PriceService, 'TOKEN_PRICE_SERVICE'],
})
export class PriceModule {}
