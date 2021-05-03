import { Seq } from 'immutable';
import Web3 from 'web3';
import dotenv from 'dotenv';
import contractAddresses from '@marginswap/core-abi/addresses.json';
import MarginRouter from '@marginswap/core-abi/artifacts/contracts/MarginRouter.sol/MarginRouter.json';
import CrossMarginTrading from '@marginswap/core-abi/artifacts/contracts/CrossMarginTrading.sol/CrossMarginTrading.json';
import HDWalletProvider from '@truffle/hdwallet-provider';
import fs from 'fs';

dotenv.config();

const MINIMUM_LOAN_AMOUNT = Web3.utils.toBN(5 * 10 ** 6);
const PRICE_WINDOW = 0.14;

enum AMMs {
  UNISWAP,
  SUSHISWAP
}

function encodeAMMPath(ammPath: AMMs[]) {
  const encoded = web3.utils.bytesToHex(ammPath.map((amm: AMMs) => (amm == AMMs.UNISWAP ? 0 : 1)));
  return `${encoded}${'0'.repeat(64 + 2 - encoded.length)}`;
}

const tokenAddresses: Record<string, string> = {
  DAI: '0x6b175474e89094c44da98b954eedeac495271d0f',
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  UNI: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
  MKR: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  BOND: '0x0391D2021f89DC339F60Fff84546EA23E337750f',
  LINK: '0x514910771af9ca656af840dff83e8264ecf986ca',
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  SUSHI: '0x6b3595068778dd592e39a122f4f5a5cf09c90fe2',
  ALCX: '0xdbdb4d16eda451d0503b854cf79d55697f90c8df'
};

type TokenInitRecord = {
  exposureCap: number;
  lendingBuffer: number;
  incentiveWeight: number;
  liquidationTokenPath?: string[];
  decimals: number;
  ammPath?: AMMs[];
};

const tokenParams: { [tokenName: string]: TokenInitRecord } = {
  DAI: {
    exposureCap: 10000000,
    lendingBuffer: 10000,
    incentiveWeight: 3,
    liquidationTokenPath: ['DAI', 'WETH'],
    decimals: 18
  },
  WETH: {
    exposureCap: 100000,
    lendingBuffer: 500,
    incentiveWeight: 3,
    liquidationTokenPath: ['WETH'],
    decimals: 18
  },
  UNI: {
    exposureCap: 100000,
    lendingBuffer: 500,
    incentiveWeight: 5,
    liquidationTokenPath: ['UNI', 'WETH'],
    decimals: 18
  },
  MKR: {
    exposureCap: 2000,
    lendingBuffer: 80,
    incentiveWeight: 5,
    liquidationTokenPath: ['MKR', 'WETH'],
    decimals: 18
  },
  USDT: {
    exposureCap: 100000000,
    lendingBuffer: 10000,
    incentiveWeight: 3,
    liquidationTokenPath: ['USDT', 'WETH'],
    decimals: 6
  },
  BOND: {
    exposureCap: 50000,
    lendingBuffer: 100,
    incentiveWeight: 1,
    liquidationTokenPath: ['BOND', 'USDC'],
    decimals: 18
  },
  LINK: {
    exposureCap: 200000,
    lendingBuffer: 100,
    incentiveWeight: 1,
    liquidationTokenPath: ['LINK', 'WETH'],
    decimals: 18,
    ammPath: [AMMs.SUSHISWAP, AMMs.UNISWAP]
  },
  USDC: {
    exposureCap: 100000000,
    lendingBuffer: 10000,
    incentiveWeight: 3,
    liquidationTokenPath: ['USDC', 'WETH'],
    decimals: 6
  },
  WBTC: {
    exposureCap: 2000,
    lendingBuffer: 20,
    incentiveWeight: 3,
    liquidationTokenPath: ['WBTC', 'WETH'],
    decimals: 8
  },
  SUSHI: {
    exposureCap: 300000,
    lendingBuffer: 4000,
    incentiveWeight: 1,
    liquidationTokenPath: ['SUSHI', 'WETH'],
    decimals: 18,
    ammPath: [AMMs.SUSHISWAP, AMMs.SUSHISWAP, AMMs.SUSHISWAP]
  },
  ALCX: {
    exposureCap: 10000,
    lendingBuffer: 100,
    incentiveWeight: 2,
    liquidationTokenPath: ['ALCX', 'WETH'],
    decimals: 18,
    ammPath: [AMMs.SUSHISWAP, AMMs.SUSHISWAP, AMMs.SUSHISWAP]
  },

  LOCALPEG: {
    exposureCap: 1000000,
    lendingBuffer: 10000,
    incentiveWeight: 5,
    decimals: 18
  }
};

type address = string;

const { NODE_URL, CHAIN_ID } = process.env;

if (!CHAIN_ID) {
  console.log('Provide a valid chain id');
  process.exit();
}

const chainId: "1" | "42" = CHAIN_ID as any;
const MARGIN_ROUTER_ADDRESS: address = contractAddresses[chainId].MarginRouter;
const CROSS_MARGIN_TRADING_ADDRESS: address = contractAddresses[chainId].CrossMarginTrading;

const homedir = require('os').homedir();
const privateKey = fs.readFileSync(`${homedir}/.marginswap-secret`).toString().trim();
const provider = new HDWalletProvider({
  privateKeys:[privateKey],
  providerOrUrl: NODE_URL
})
const web3 = new Web3(provider);

async function getAccountAddresses() {
  const router = new web3.eth.Contract(MarginRouter.abi as any, MARGIN_ROUTER_ADDRESS);
  const events = await router
    .getPastEvents('AccountUpdated',
    {
      fromBlock: 0,
      toBlock: 'latest'
    });
  
  const addresses = Seq(events).map(event => event.returnValues.trader).toSet();
  console.log(`currently there are ${addresses.size} unique addresses`);
  const liquifiable: address[] = [];

  for (const account of addresses) {
    const canB = await canBeLiquidated(account); 
    if (canB) {

      liquifiable.push(account);
    }
  }
  return liquifiable;
}

async function canBeLiquidated(account: address): Promise<boolean> {
  const cmt = new web3.eth.Contract(CrossMarginTrading.abi as any, CROSS_MARGIN_TRADING_ADDRESS);

  return (await cmt.methods.canBeLiquidated(account).call()) && Web3.utils.toBN(await cmt.methods.viewLoanInPeg(account).call()).gt(MINIMUM_LOAN_AMOUNT);
}

function liquidateAccounts(accounts: address[]) {
  const cmt = new web3.eth.Contract(CrossMarginTrading.abi as any, CROSS_MARGIN_TRADING_ADDRESS, {from: provider.getAddresses()[0]});
  // cmt.defaultCommon = {customChain: {name: 'hardhat', chainId: 1, networkId: 31337}, baseChain: 'mainnet'};
  if (accounts.length > 0) {
    return cmt.methods.liquidate(accounts).send();
  }
}

async function priceDisparity(name:string) {
  const router = new web3.eth.Contract(MarginRouter.abi as any, MARGIN_ROUTER_ADDRESS);
  const cmt = new web3.eth.Contract(CrossMarginTrading.abi as any, CROSS_MARGIN_TRADING_ADDRESS, {from: provider.getAddresses()[0]});
  const tokens = tokenParams[name].liquidationTokenPath;
  tokens?.push('USDT');
  const path = tokens?.map((tokenName) => tokenAddresses[tokenName]);
  const amms = encodeAMMPath(tokenParams[name].ammPath || [AMMs.UNISWAP]);
  const amountOut = 10 * 10 ** 6;
  const amountIn = (await router.methods.getAmountsIn(amountOut, amms, path).call())[0];
  return Web3.utils.toBN(await cmt.methods.viewCurrentPriceInPeg(tokenAddresses[name], amountIn).call()).toNumber() / amountOut;
}


export default async function main() {
  const cmt = new web3.eth.Contract(CrossMarginTrading.abi as any, CROSS_MARGIN_TRADING_ADDRESS, {from: provider.getAddresses()[0]});
  for (const tokenId in tokenAddresses) {
    const priceDisp = await priceDisparity(tokenId);
    if (priceDisp > 1 + PRICE_WINDOW || priceDisp < 1 - PRICE_WINDOW) {
      console.log(`Upddating price of ${tokenId}`);
      await cmt.methods.getCurrentPriceInPeg(tokenAddresses[tokenId], 10 ** 18, true);
    }
  }
  return getAccountAddresses()
    .then((liquifiableAccounts) => {
      console.log(`The following accounts are liquidatable:`);
      console.log(liquifiableAccounts);
      return liquifiableAccounts;
    })
    .then(liquidateAccounts)
    .then(console.log)
    .catch(console.log);
}

main().then(_ => process.exit());
