import { Test, TestingModule } from '@nestjs/testing';
import { MorphoService } from '../morpho/morpho.service';
import { MarketsService } from './markets.service';
import { MarketSearchQueryDto } from '../common/dto/market-search.dto';
import { ProtocolPoolsDto } from '../common/dto/market.dto';
import { AaveService } from 'src/aave/aave.service';

describe('MarketsService', () => {
  let service: MarketsService;
  let morphoService: MorphoService;
  let aaveService: AaveService;

  const mockMorphoMarkets: ProtocolPoolsDto = {
    protocol: 'morpho',
    pools: [
      {
        name: 'WETH Pool',
        poolId: '0x123',
        totalValueUsd: 500000,
        assets: [
          {
            underlyingSymbol: 'WETH',
            totalSupply: '1000000000000000000',
            totalSupplyUsd: '500000',
            totalBorrow: '500000000000000000',
            totalBorrowUsd: '250000',
            liquidity: '500000000000000000',
            liquidityUsd: '250000',
            supplyApy: '0.05',
            borrowApy: '0.08',
            isCollateral: true,
            ltv: '0.8',
            rewards: [],
          },
        ],
      },
    ],
  };

  const mockAaveMarkets: ProtocolPoolsDto = {
    protocol: 'aave',
    pools: [
      {
        name: 'WETH Pool',
        poolId: '0x456',
        totalValueUsd: 250000,
        assets: [
          {
            underlyingSymbol: 'WETH',
            totalSupply: '500000000000000000',
            totalSupplyUsd: '250000',
            totalBorrow: '250000000000000000',
            totalBorrowUsd: '125000',
            liquidity: '250000000000000000',
            liquidityUsd: '125000',
            supplyApy: '0.04',
            borrowApy: '0.07',
            isCollateral: true,
            ltv: '0.75',
            rewards: [],
          },
        ],
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketsService,
        {
          provide: MorphoService,
          useValue: {
            getMarketInfo: jest.fn().mockResolvedValue(mockMorphoMarkets),
          },
        },
        {
          provide: AaveService,
          useValue: {
            getMarketInfo: jest.fn().mockResolvedValue(mockAaveMarkets),
          },
        },
      ],
    }).compile();

    service = module.get<MarketsService>(MarketsService);
    morphoService = module.get<MorphoService>(MorphoService);
    aaveService = module.get<AaveService>(AaveService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAllMarkets', () => {
    it('should return markets for specific protocol when protocol is specified', async () => {
      const query: MarketSearchQueryDto = { protocol: 'morpho', chain: 'base' };
      const result = await service.getAllMarkets(query);

      expect(result.chains[0].protocols).toHaveLength(1);
      expect(result.chains[0].protocols[0].protocol).toBe('morpho');
    });

    it('should return markets for specific chain when chain is specified', async () => {
      const query: MarketSearchQueryDto = { chain: 'base' };
      const result = await service.getAllMarkets(query);

      expect(result.chains).toHaveLength(1);
      expect(result.chains[0].chain).toBe('base');
    });

    it('should filter out protocols with no pools', async () => {
      const emptyMarkets: ProtocolPoolsDto = {
        protocol: 'morpho',
        pools: [],
      };
      jest
        .spyOn(morphoService, 'getMarketInfo')
        .mockResolvedValueOnce(emptyMarkets);

      const query: MarketSearchQueryDto = { chain: 'base' };
      const result = await service.getAllMarkets(query);

      // Only Aave should remain with pools
      expect(result.chains[0].protocols).toHaveLength(1);
      expect(result.chains[0].protocols[0].protocol).toBe('aave');
    });

    it('should filter out chains with no protocols', async () => {
      const emptyMarkets: ProtocolPoolsDto = {
        protocol: 'morpho',
        pools: [],
      };
      jest
        .spyOn(morphoService, 'getMarketInfo')
        .mockResolvedValueOnce(emptyMarkets);
      jest
        .spyOn(aaveService, 'getMarketInfo')
        .mockResolvedValueOnce(emptyMarkets as any);

      const query: MarketSearchQueryDto = { chain: 'base' };
      const result = await service.getAllMarkets(query);

      // No chains should be returned
      expect(result.chains).toHaveLength(0);
    });

    it('should handle errors from protocol services', async () => {
      jest
        .spyOn(morphoService, 'getMarketInfo')
        .mockRejectedValueOnce(new Error('Morpho error'));

      const query: MarketSearchQueryDto = { chain: 'base' };
      const result = await service.getAllMarkets(query);

      // Should still return Aave results
      expect(result.chains[0].protocols).toHaveLength(1);
      expect(result.chains[0].protocols[0].protocol).toBe('aave');
    });
  });
});
