'use strict'
require('colors');
const { ERC20BridgeSource, SwapQuoter: ProdSwapQuoter } = require('@0x/asset-swapper');
const { SwapQuoter: DevSwapQuoter } = require('@0x/asset-swapper-dev');
const { getContractAddressesForChainOrThrow } = require('@0x/contract-addresses-dev');
const { Orderbook } = require('@0x/orderbook-dev');
const { RPCSubprovider, SupportedProvider, Web3ProviderEngine } = require('@0x/subproviders');
const { providerUtils: ZeroExProviderUtils } = require('@0x/utils');
const BigNumber = require('bignumber.js');
const process = require('process');
const yargs = require('yargs');
const { Server } = require('./server');

const ARGV = yargs
    .number('port')
    .boolean('fallback').default('fallback', true)
    .default('port', 7001)
    .argv;

const ADDRESSES = getContractAddressesForChainOrThrow(1);
const SRA_API_URL = 'https://api.0x.org/sra';
const GAS_SCHEDULE = {
    [ERC20BridgeSource.Uniswap]: new BigNumber(2.5e5),
    [ERC20BridgeSource.Native]: new BigNumber(2e5),
    [ERC20BridgeSource.CurveUsdcDai]: new BigNumber(4e5),
    [ERC20BridgeSource.Eth2Dai]: new BigNumber(5e5),
    [ERC20BridgeSource.CurveUsdcDaiUsdt]: new BigNumber(5e5),
    [ERC20BridgeSource.CurveUsdcDaiUsdtTusd]: new BigNumber(8e5),
    [ERC20BridgeSource.CurveUsdcDaiUsdtBusd]: new BigNumber(8e5),
    [ERC20BridgeSource.Kyber]: new BigNumber(8e5),
};
const FEE_SCHEDULE = {
    ...GAS_SCHEDULE,
    [ERC20BridgeSource.Native]: GAS_SCHEDULE[ERC20BridgeSource.Native].plus(150e3),
};
for (const [k, v] of Object.entries(GAS_SCHEDULE)) {
    GAS_SCHEDULE[k] = v.toNumber();
}
const ASSET_SWAPPER_MARKET_ORDERS_OPTS = {
    noConflicts: true,
    excludedSources: [],
    runLimit: 2 ** 15,
    bridgeSlippage: 0.01,
    slippagePercentage: 0.01,
    dustFractionThreshold: 0.0025,
    numSamples: 13,
    sampleDistributionBase: 1.05,
    fees: FEE_SCHEDULE,
    feeSchedule: FEE_SCHEDULE,
    gasSchedule: GAS_SCHEDULE,
    maxFallbackSlippage: 0.015,
    allowFallback: !!ARGV.fallback,
};
const SWAP_QUOTER_OPTS = {
    chainId: 1,
    contractAddresses: ADDRESSES,
};

(async() => {
    const provider = createZeroExProvider(process.env.NODE_RPC);
    const orderbook = createOrderbook(SRA_API_URL);
    const server = new Server(provider);
    server.addQuoteEndpoint('/swap/prod/quote', createProductionQuoter(provider, orderbook));
    server.addQuoteEndpoint('/swap/dev/quote', createDevelopmentQuoter(provider, orderbook));
    await server.listen(ARGV.port);
    console.log(`${'*'.bold} Listening on port ${ARGV.port.toString().bold.green}...`);
})();

function createOrderbook(sraApiUrl) {
    return Orderbook.getOrderbookForPollingProvider({
        httpEndpoint: sraApiUrl,
        pollingIntervalMs: 10000,
        perPage: 1000,
    });
}

function createZeroExProvider(rpcHost) {
    const providerEngine = new Web3ProviderEngine();
    providerEngine.addProvider(new RPCSubprovider(rpcHost));
    ZeroExProviderUtils.startProviderEngine(providerEngine);
    return providerEngine;
}

function createProductionQuoter(provider, orderbook) {
    const swapQuoter = new ProdSwapQuoter(
        provider,
        orderbook,
        SWAP_QUOTER_OPTS,
    );
    return async (opts) => {
        console.log(`prod: ${JSON.stringify(opts)}`);
        const marketOpts = {
            ...ASSET_SWAPPER_MARKET_ORDERS_OPTS,
            ...(opts.gasPrice === undefined
                ? {} : { gasPrice: opts.gasPrice }),
            ...(opts.numSamples === undefined
                ? {} : { numSamples: opts.numSamples }),
            ...(opts.runLimit === undefined
                ? {} : { runLimit: opts.runLimit }),
        };
        if (opts.buyAmount) {
            return swapQuoter.getMarketBuySwapQuoteAsync(
                opts.buyTokenAddress,
                opts.sellTokenAddress,
                opts.buyAmount,
                ASSET_SWAPPER_MARKET_ORDERS_OPTS,
            );
        }
        return swapQuoter.getMarketSellSwapQuoteAsync(
            opts.buyTokenAddress,
            opts.sellTokenAddress,
            opts.sellAmount,
            ASSET_SWAPPER_MARKET_ORDERS_OPTS,
        );
    };
}

function createDevelopmentQuoter(provider, orderbook) {
    const swapQuoter = new DevSwapQuoter(
        provider,
        orderbook,
        SWAP_QUOTER_OPTS,
    );
    return async (opts) => {
        console.log(`dev: ${JSON.stringify(opts)}`);
        const marketOpts = {
            ...ASSET_SWAPPER_MARKET_ORDERS_OPTS,
            ...(opts.bridgeSlippage === undefined
                ? {} : { bridgeSlippage: opts.bridgeSlippage }),
            ...(opts.maxFallbackSlippage === undefined
                ? {} : { maxFallbackSlippage: opts.maxFallbackSlippage }),
            ...(opts.gasPrice === undefined
                ? {} : { gasPrice: opts.gasPrice }),
            ...(opts.numSamples === undefined
                ? {} : { numSamples: opts.numSamples }),
            ...(opts.runLimit === undefined
                ? {} : { runLimit: opts.runLimit }),
        };
        if (opts.buyAmount) {
            return swapQuoter.getMarketBuySwapQuoteAsync(
                opts.buyTokenAddress,
                opts.sellTokenAddress,
                opts.buyAmount,
                marketOpts,
            );
        }
        return swapQuoter.getMarketSellSwapQuoteAsync(
            opts.buyTokenAddress,
            opts.sellTokenAddress,
            opts.sellAmount,
            marketOpts,
        );
    };
}
