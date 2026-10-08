// The real Aave and Morpho services pull in ESM-only and network-bound dependencies; these tests replace
// both fetchers anyway, so the modules are stubbed.
jest.mock('../aave/aave.service', () => ({ AaveService: class {} }));
jest.mock('../morpho/morpho.service', () => ({ MorphoService: class {} }));

import { MarketsService } from './markets.service';
import { MarketAssetDto, ProtocolPoolsDto } from './dto/market.dto';

const asset = (symbol: string): MarketAssetDto => ({
  underlyingSymbol: symbol,
  totalSupply: '0',
  totalSupplyUsd: '0',
  totalBorrow: '0',
  totalBorrowUsd: '0',
  liquidity: '0',
  liquidityUsd: '0',
  supplyApy: '0.05',
  borrowApy: '0.08',
  isCollateral: true,
  ltv: '0.80',
  rewards: [],
});

const markets = (protocol: string, ...symbols: string[]): ProtocolPoolsDto => ({
  protocol,
  chains: [{ chain: 'base', pools: [{ name: `${protocol} pool`, poolId: '0x1', totalValueUsd: 1, assets: symbols.map(asset) }] }],
});

function build() {
  const store = new Map<string, unknown>();
  const cache = { get: async (k: string) => store.get(k), set: async (k: string, v: unknown) => void store.set(k, v) };
  const service = new MarketsService({} as any, {} as any, cache as any);
  const aave = jest.spyOn(service as any, 'getAaveMarkets').mockResolvedValue(markets('aave', 'WETH', 'USDC'));
  const morpho = jest.spyOn(service as any, 'getMorphoMarkets').mockResolvedValue(markets('morpho', 'WETH'));
  return { service, aave, morpho, store };
}

describe('MarketsService.getAllMarkets', () => {
  it('returns every protocol that has markets', async () => {
    const { service } = build();
    const result = await service.getAllMarkets({});
    expect(result.protocols.map((p) => p.protocol).sort()).toEqual(['aave', 'morpho']);
  });

  it('keeps the other protocols when one of them fails', async () => {
    const { service, morpho } = build();
    morpho.mockRejectedValue(new Error('Morpho API down'));
    const result = await service.getAllMarkets({});
    expect(result.protocols.map((p) => p.protocol)).toEqual(['aave']);
  });

  it('drops a protocol that returns no chains', async () => {
    const { service, morpho } = build();
    morpho.mockResolvedValue({ protocol: 'morpho', chains: [] });
    const result = await service.getAllMarkets({});
    expect(result.protocols.map((p) => p.protocol)).toEqual(['aave']);
  });

  it('only asks the protocol named in the query', async () => {
    const { service, aave } = build();
    const result = await service.getAllMarkets({ protocol: 'morpho' } as any);
    expect(aave).not.toHaveBeenCalled();
    expect(result.protocols.map((p) => p.protocol)).toEqual(['morpho']);
  });

  // A single symbol is filtered by the fetchers themselves (a Morpho pool is a collateral and loan pair,
  // so this pass must not split it); this pass only narrows when both symbols are given.
  it('with both symbols, keeps assets matching either, ignoring case, and prunes what is left empty', async () => {
    const { service } = build();
    const result = await service.getAllMarkets({ collateralTokenSymbol: 'usdc', borrowTokenSymbol: 'dai' });
    expect(result.protocols.map((p) => p.protocol)).toEqual(['aave']);
    expect(result.protocols[0].chains[0].pools[0].assets.map((a) => a.underlyingSymbol)).toEqual(['USDC']);
  });

  it('serves a repeated query from the cache', async () => {
    const { service, aave, store } = build();
    await service.getAllMarkets({ chain: 'base' });
    await service.getAllMarkets({ chain: 'base' });
    expect(aave).toHaveBeenCalledTimes(1);
    expect([...store.keys()]).toEqual(['markets:all:base:all:all']);
  });
});
