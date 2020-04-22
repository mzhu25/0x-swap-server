'use strict'
const { SwapQuoteConsumer} = require('@0x/asset-swapper');
const { getContractAddressesForChainOrThrow } = require('@0x/contract-addresses');
const BigNumber = require('bignumber.js');
const express = require('express');
const TOKENS = require('./tokens');

class Server {
    constructor(provider) {
        this._quoteConsumer = new SwapQuoteConsumer(
            provider,
            {
                chainId: 1,
                contractAddresses: getContractAddressesForChainOrThrow(1),
            },
        );
        this._app = express();
        this._app.use(express.json());
    }

    addQuoteEndpoint(endpoint, quoter) {
        this._app.get(
            endpoint,
            async (req, res) => {
                const quoterOpts = createQuoterOpts(req.query);
                try {
                    const quote = await quoter(quoterOpts);
                    const {
                        calldataHexString: callData,
                        toAddress,
                        ethAmount,
                    } = await this._quoteConsumer.getCalldataOrThrowAsync(
                        quote,
                        {
                            useExtensionContract: quoterOpts.sellToken === 'ETH' ? 'FORWARDER' : undefined
                        },
                    );
                    res.json({
                        price: getPrice(quoterOpts.buyToken, quoterOpts.sellToken, quote.bestCaseQuoteInfo),
                        to: toAddress,
                        value: ethAmount,
                        data: callData,
                        gas: quote.worstCaseQuoteInfo.gas || 0,
                        gasPrice: quote.gasPrice,
                        orders: cleanSignedOrderFields(quote.orders),
                        sources: convertSourceBreakdownToArray(quote.sourceBreakdown),
                        buyAmount: quote.bestCaseQuoteInfo.makerAssetAmount,
                        sellAmount: quote.bestCaseQuoteInfo.totalTakerAssetAmount,
                        protocolFee: quote.worstCaseQuoteInfo.protocolFeeInWeiAmount,
                        buyTokenAddress: quoterOpts.buyTokenAddress,
                        sellTokenAddress: quoterOpts.sellTokenAddress,
                    });
                } catch (err) {
                    console.error(err);
                    res.status(500);
                    res.json({ 'error': err.toString(), stack: JSON.stringify(err.stack) });
                }
            },
        );
    }

    async listen(port) {
        return new Promise((accept, reject) => {
            this._app.listen(
                port,
                (err) => {
                    if (err) {
                        return reject(err);
                    }
                    accept();
                },
            );
        });
    }
}

function createQuoterOpts(query) {
    let { buyToken, sellToken, buyAmount, sellAmount } = query;
    if (!buyAmount && !sellAmount) {
        throw new Error('No buy or sell a mount specified');
    }
    buyToken = (buyToken === 'WETH' ? 'ETH' : buyToken) || 'ETH';
    sellToken = (sellToken === 'WETH' ? 'ETH' : sellToken) || 'ETH';
    return {
        buyToken,
        sellToken,
        buyTokenAddress: TOKENS[buyToken].address,
        sellTokenAddress: TOKENS[sellToken].address,
        buyAmount: buyAmount !== undefined ? new BigNumber(buyAmount) : undefined,
        sellAmount: sellAmount !== undefined ? new BigNumber(sellAmount) : undefined,
        bridgeSlippage: query.bridgeSlippage !== undefined ? parseFloat(query.bridgeSlippage) : undefined,
        maxFallbackSlippage: query.maxFallbackSlippage !== undefined ? parseFloat(query.maxFallbackSlippage) : undefined,
        gasPrice: query.gasPrice !== undefined ? new BigNumber(query.gasPrice) : undefined,
        numSamples: query.numSamples !== undefined ? parseInt(query.numSamples) : undefined,
        runLimit: query.runLimit !== undefined ? parseInt(query.runLimit) : undefined,
    };
}

function getPrice(buyToken, sellToken, quoteInfo) {
    const buyDecimals = TOKENS[buyToken].decimals;
    const sellDecimals = TOKENS[sellToken].decimals;
    return quoteInfo.makerAssetAmount.div(10**buyDecimals)
        .div(quoteInfo.totalTakerAssetAmount.div(10**sellDecimals));
}

function convertSourceBreakdownToArray(sourceBreakdown) {
    return Object.entries(sourceBreakdown).reduce(
        (acc, [source, percentage]) => {
            return [
                ...acc,
                {
                    name: source === 'Native' ? '0x' : source,
                    proportion: new BigNumber(percentage.toPrecision(2)),
                },
            ];
        },
        [],
    );
}

function cleanSignedOrderFields(orders) {
    return orders.map(o => ({
        chainId: o.chainId,
        exchangeAddress: o.exchangeAddress,
        makerAddress: o.makerAddress,
        takerAddress: o.takerAddress,
        feeRecipientAddress: o.feeRecipientAddress,
        senderAddress: o.senderAddress,
        makerAssetAmount: o.makerAssetAmount,
        takerAssetAmount: o.takerAssetAmount,
        makerFee: o.makerFee,
        takerFee: o.takerFee,
        expirationTimeSeconds: o.expirationTimeSeconds,
        salt: o.salt,
        makerAssetData: o.makerAssetData,
        takerAssetData: o.takerAssetData,
        makerFeeAssetData: o.makerFeeAssetData,
        takerFeeAssetData: o.takerFeeAssetData,
        signature: o.signature,
    }));
}

module.exports = {
    Server,
};
