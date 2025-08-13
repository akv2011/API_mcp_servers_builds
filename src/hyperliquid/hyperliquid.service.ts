import { Address } from 'viem';
import * as hl from '@nktkas/hyperliquid';
import { Injectable, Logger } from '@nestjs/common';
import { HyperliquidPositionDto } from './dto/position.dto';
import { HyperliquidOrderDto } from './dto/order.dto';
import {
  ClearinghouseStateDto,
  HyperliquidMarginSummaryDto,
  HyperliquidCrossMarginSummaryDto,
} from './dto/clearinghouse-state.dto';

@Injectable()
export class HyperliquidService {
  private readonly logger = new Logger(HyperliquidService.name);
  private readonly hlClient: hl.InfoClient;

  constructor() {
    const transport = new hl.HttpTransport();
    this.hlClient = new hl.InfoClient({ transport });
  }

  async getOpenPositions({
    user,
  }: {
    user: Address;
  }): Promise<ClearinghouseStateDto | null> {
    try {
      const clearinghouse = await this.hlClient.clearinghouseState({ user });

      if (!clearinghouse) {
        this.logger.warn(`No clearinghouse state found for user ${user}`);
        return null;
      }

      const positions =
        clearinghouse.assetPositions?.map((assetPosition) => {
          const position = assetPosition.position;

          const coin = position.coin || '';
          const szi = position.szi || '0';

          const size = Math.abs(Number(szi));
          const side = Number(szi) > 0 ? 'long' : 'short';

          const unrealizedPnl = position.unrealizedPnl || '0';
          const margin = position.marginUsed || '0';
          const notional = position.positionValue || '0';
          const liquidationPrice = position.liquidationPx || '0';
          const indexPrice = position.entryPx || '0';

          const leverage =
            size > 0 ? Number(notional) / Number(margin || '1') : 1;
          const entryPrice = size > 0 ? Number(notional) / size : 0;
          const roe =
            Number(margin) > 0
              ? (Number(unrealizedPnl) / Number(margin)) * 100
              : 0;

          const leverageValue = position.leverage?.value
            ? Number(position.leverage.value)
            : leverage;

          const leverageType = position.leverage?.type || 'cross';

          const maxLeverage = position.maxLeverage
            ? Number(position.maxLeverage)
            : undefined;

          const returnOnEquity = position.returnOnEquity
            ? Number(position.returnOnEquity) * 100
            : roe;

          return {
            symbol: coin,
            entryPrice,
            markPrice: Number(indexPrice),
            size,
            side,
            leverage: leverageValue,
            leverageType,
            maxLeverage,
            unrealizedPnl: Number(unrealizedPnl),
            liquidationPrice: Number(liquidationPrice),
            marginUsed: Number(margin),
            positionValue: Number(notional),
            fundingRate: 0,
            fundingPaid: Number(position.cumFunding?.allTime || 0),
            fundingSinceOpen: Number(position.cumFunding?.sinceOpen || 0),
            fundingSinceChange: Number(position.cumFunding?.sinceChange || 0),
            roe: returnOnEquity,
            positionId: `${coin}-${side}-${Date.now()}`,
          };
        }) || [];

      const marginSummary: HyperliquidMarginSummaryDto = {
        accountValue: clearinghouse.marginSummary.accountValue,
        totalMarginUsed: clearinghouse.marginSummary.totalMarginUsed,
        totalNtlPos: clearinghouse.marginSummary.totalNtlPos,
        totalRawUsd: clearinghouse.marginSummary.totalRawUsd,
      };

      const crossMarginSummary: HyperliquidCrossMarginSummaryDto = {
        accountValue: clearinghouse.crossMarginSummary.accountValue,
        totalMarginUsed: clearinghouse.crossMarginSummary.totalMarginUsed,
        totalNtlPos: clearinghouse.crossMarginSummary.totalNtlPos,
        totalRawUsd: clearinghouse.crossMarginSummary.totalRawUsd,
      };

      return {
        marginSummary,
        crossMarginSummary,
        positions: positions as HyperliquidPositionDto[],
      };
    } catch (error: any) {
      this.logger.error(
        `Error fetching Hyperliquid positions for ${user}: ${error?.message}`,
        error?.stack,
      );
      return null;
    }
  }

  async getOpenOrders({
    user,
  }: {
    user: Address;
  }): Promise<HyperliquidOrderDto[]> {
    try {
      const frontendOrders = await this.hlClient.frontendOpenOrders({ user });

      const mappedOrders: HyperliquidOrderDto[] = frontendOrders.map(
        (sdkOrder) => {
          return {
            oid: sdkOrder.oid,
            asset: sdkOrder.coin,
            side: sdkOrder.side,
            limitPx: sdkOrder.limitPx,
            sz: sdkOrder.sz,
            timestamp: sdkOrder.timestamp,
            origSz: sdkOrder.origSz,
            isTrigger: sdkOrder.isTrigger,
            triggerPx: sdkOrder.triggerPx,
            triggerCondition: sdkOrder.triggerCondition,
            reduceOnly: sdkOrder.reduceOnly,
            orderType: sdkOrder.orderType,
            tif: sdkOrder.tif ?? null,
            cloid: sdkOrder.cloid ?? null,
            isPositionTpsl: sdkOrder.isPositionTpsl,
          };
        },
      );

      return mappedOrders;
    } catch (error: any) {
      this.logger.error(
        `Error fetching Hyperliquid frontend open orders for ${user}: ${error?.message}`,
        error?.stack,
      );
      return [];
    }
  }
}
