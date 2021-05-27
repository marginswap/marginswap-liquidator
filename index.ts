import { Seq } from 'immutable';
import {Contract, utils, providers, Wallet, BigNumber } from 'ethers';
import dotenv from 'dotenv';
import contractAddresses from '@marginswap/core-abi/addresses.json';
import MarginRouter from '@marginswap/core-abi/artifacts/contracts/MarginRouter.sol/MarginRouter.json';
import CrossMarginTrading from '@marginswap/core-abi/artifacts/contracts/CrossMarginTrading.sol/CrossMarginTrading.json';
import fs from 'fs';
import { getAddress } from '@ethersproject/address';

dotenv.config();

enum AMMs {
  UNISWAP,
  SUSHISWAP
}

function encodeAMMPath(ammPath: AMMs[]) {
  const encoded = utils.hexlify(ammPath.map((amm: AMMs) => (amm == AMMs.UNISWAP ? 0 : 1)));
  return `${encoded}${'0'.repeat(64 + 2 - encoded.length)}`;
}

const baseCurrency: Record<string, string> = {
  '42': 'WETH',
  '1': 'WETH',
  '43114': 'WAVAX',
  '31337': 'WETH'
};

export const tokensPerNetwork: Record<string, Record<string, string>> = {
  42: {
    //    USDT: USDT_ADDRESS,
    DAI: '0x4f96fe3b7a6cf9725f59d353f723c1bdb64ca6aa',
    WETH: '0xd0a1e359811322d97991e03f863a0c30c2cf029c',
    UNI: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984'
    //    MKR: "0xac94ea989f6955c67200dd67f0101e1865a560ea",
  },
  1: {
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
  },
  31337: {
    DAI: '0x6b175474e89094c44da98b954eedeac495271d0f',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    ALCX: '0xdbdb4d16eda451d0503b854cf79d55697f90c8df',
    UNI: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984'
  },
  43114: {
    WAVAX: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    ETH: '0xf20d962a6c8f70c731bd838a3a388D7d48fA6e15',
    PNG: '0x60781C2586D68229fde47564546784ab3fACA982',
    WBTC: '0x408D4cD0ADb7ceBd1F1A1C33A0Ba2098E1295bAB',
    USDT: '0xde3A24028580884448a5397872046a019649b084'
  }
};

 type TokenInitRecord = {
  exposureCap: number;
  lendingBuffer: number;
  incentiveWeight: number;
  liquidationTokenPath: string[];
  decimals: number;
  ammPath?: AMMs[];
};

const tokenParams: { [tokenName: string]: TokenInitRecord } = {
  DAI: {
    exposureCap: 10000000,
    lendingBuffer: 10000,
    incentiveWeight: 3,
    liquidationTokenPath: ['DAI', 'BASE'],
    decimals: 18
  },
  WETH: {
    exposureCap: 100000,
    lendingBuffer: 500,
    incentiveWeight: 3,
    liquidationTokenPath: ['BASE'],
    decimals: 18
  },
  UNI: {
    exposureCap: 100000,
    lendingBuffer: 500,
    incentiveWeight: 5,
    liquidationTokenPath: ['UNI', 'BASE'],
    decimals: 18
  },
  MKR: {
    exposureCap: 2000,
    lendingBuffer: 80,
    incentiveWeight: 5,
    liquidationTokenPath: ['MKR', 'BASE'],
    decimals: 18
  },
  USDT: {
    exposureCap: 100000000,
    lendingBuffer: 10000,
    incentiveWeight: 3,
    liquidationTokenPath: ['USDT', 'BASE'],
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
    liquidationTokenPath: ['LINK', 'BASE'],
    decimals: 18,
    ammPath: [AMMs.SUSHISWAP, AMMs.UNISWAP]
  },
  USDC: {
    exposureCap: 100000000,
    lendingBuffer: 10000,
    incentiveWeight: 3,
    liquidationTokenPath: ['USDC', 'BASE'],
    decimals: 6
  },
  WBTC: {
    exposureCap: 2000,
    lendingBuffer: 20,
    incentiveWeight: 3,
    liquidationTokenPath: ['WBTC', 'BASE'],
    decimals: 8
  },
  SUSHI: {
    exposureCap: 300000,
    lendingBuffer: 4000,
    incentiveWeight: 1,
    liquidationTokenPath: ['SUSHI', 'BASE'],
    decimals: 18,
    ammPath: [AMMs.SUSHISWAP, AMMs.SUSHISWAP, AMMs.SUSHISWAP]
  },
  ALCX: {
    exposureCap: 10000,
    lendingBuffer: 100,
    incentiveWeight: 2,
    liquidationTokenPath: ['ALCX', 'BASE'],
    decimals: 18,
    ammPath: [AMMs.SUSHISWAP, AMMs.SUSHISWAP, AMMs.SUSHISWAP]
  },
  WAVAX: {
    exposureCap: 1000000,
    lendingBuffer: 10000,
    incentiveWeight: 3,
    liquidationTokenPath: ['WAVAX'],
    decimals: 18
  },
  ETH: {
    exposureCap: 100000,
    lendingBuffer: 500,
    incentiveWeight: 3,
    liquidationTokenPath: ['ETH', 'BASE'],
    decimals: 18
  },
  PNG: {
    exposureCap: 1000000,
    lendingBuffer: 1,
    incentiveWeight: 3,
    liquidationTokenPath: ['PNG', 'BASE'],
    decimals: 18
  },
};

function replaceBase(tokenPath:string[]) {
  return tokenPath.map((tName) => tName === 'BASE' ? baseCurrency[CHAIN_ID ?? '1'] : tName);
}

const liquiPaths: Record<string, [string, string[], AMMs[]]> = {}

type address = string;

const { NODE_URL, CHAIN_ID, MINIMUM_LOAN_USD, PRICE_WINDOW, START_BLOCK } = process.env;
const START_BLOCK_PARSED = parseInt(START_BLOCK ?? '9000000');

for (let name in tokensPerNetwork[CHAIN_ID ?? '1']) {
  liquiPaths[getAddress(tokensPerNetwork[CHAIN_ID ?? '1'][name])] = [name, [...replaceBase(tokenParams[name].liquidationTokenPath), 'USDT'], tokenParams[name].ammPath ?? [AMMs.UNISWAP]];
}

const MINIMUM_LOAN_AMOUNT = `${MINIMUM_LOAN_USD ?? '5'}${'0'.repeat(6)}`;

if (!CHAIN_ID) {
  console.log('Provide a valid chain id');
  process.exit();
}

const chainId: "1" | "42" = CHAIN_ID as any;
const MARGIN_ROUTER_ADDRESS: address = contractAddresses[chainId].MarginRouter;
const CROSS_MARGIN_TRADING_ADDRESS: address = contractAddresses[chainId].CrossMarginTrading;

const homedir = require('os').homedir();
const privateKey = fs.readFileSync(`${homedir}/.marginswap-secret`).toString().trim();
const provider = new providers.JsonRpcProvider(NODE_URL);
const wallet = new Wallet(privateKey, provider);


async function getAccountAddresses() {
  const router = new Contract( MARGIN_ROUTER_ADDRESS, MarginRouter.abi, wallet);

  const events = await router
    .queryFilter({
      address: MARGIN_ROUTER_ADDRESS,
      // topics: ['AccountUpdated']
    }, START_BLOCK_PARSED, 'latest');
  
  const addresses = Seq(events).filter(event => event.event === 'AccountUpdated').map(event => event.args?.trader).toSet();
  console.log(`currently there are ${addresses.size} unique addresses`);
  let liquifiable = [];

  let totalLoan = 0;
  let totalHoldings = 0;

  for (const account of addresses) {
    const canB = await canBeLiquidated(account); 
    if (canB) {
      const loan = canB.loan.toNumber() /  10 ** 6;
      const holdings = canB.holdings.toNumber() / 10 ** 6;
      if (canB.canBeLiquidated) {
        liquifiable.push(canB.address);
        totalLoan += loan;
        totalHoldings += holdings;
      }

      if (holdings > 100) {
        console.log(`${account}: ${holdings} / ${loan}`);
        if (loan > holdings) {
          console.log(`$${loan - holdings } shortfall for ${account}`);
        }
      }
    }
  }

  console.log(`To liquidate: Total holdings: ${totalHoldings}, total loan: ${totalLoan}`);

  return liquifiable;
}

async function canBeLiquidated(account: address): Promise<{address:string, loan: BigNumber, holdings: BigNumber, canBeLiquidated: boolean} | undefined > {
  if (account) {
    const cmt = new Contract(CROSS_MARGIN_TRADING_ADDRESS, CrossMarginTrading.abi, wallet);
    const loan = await cmt.viewLoanInPeg(account);
    const holdings = await cmt.viewHoldingsInPeg(account);
    const canBeLiquidated = (await cmt.canBeLiquidated(account)) && loan.gt(MINIMUM_LOAN_AMOUNT);
      return {
        canBeLiquidated,
        address: account,
        loan,
        holdings
      }
    }
}

function liquidateAccounts(accounts: address[]) {
  const cmt = new Contract(CROSS_MARGIN_TRADING_ADDRESS, CrossMarginTrading.abi, wallet);
  // cmt.defaultCommon = {customChain: {name: 'hardhat', chainId: 1, networkId: 31337}, baseChain: 'mainnet'};
  if (accounts.length > 0) {
    return cmt.liquidate(accounts);
  }
}

async function priceDisparity(name:string) {
  const router = new Contract(MARGIN_ROUTER_ADDRESS, MarginRouter.abi, wallet);
  const cmt = new Contract(CROSS_MARGIN_TRADING_ADDRESS, CrossMarginTrading.abi, wallet);
  const tokens = replaceBase(tokenParams[name].liquidationTokenPath);
  const tokenAddresses = tokensPerNetwork[CHAIN_ID ?? '1'];
  tokens?.push('USDT');
  const path = tokens?.map((tokenName) => tokenAddresses[tokenName]);
  const amms = encodeAMMPath(tokenParams[name].ammPath || [AMMs.UNISWAP]);
  const amountOut = 1 * 10 ** 6;
  const amountIn = (await router.getAmountsIn(amountOut, amms, path))[0];
  const currentPrice = (await cmt.viewCurrentPriceInPeg(tokenAddresses[name], amountIn)).toNumber();
  const oneOfToken = `1${'0'.repeat(tokenParams[name].decimals)}`;
  console.log((await cmt.viewCurrentPriceInPeg(tokenAddresses[name], oneOfToken)).toNumber() / (10 ** 6));
  const outAmounts = (await router.getAmountsOut(oneOfToken, amms, path));
  console.log(outAmounts[outAmounts.length - 1].toNumber() / (10 ** 6));
  return currentPrice / amountOut;
}


export default async function main() {
  const cmt = new Contract(CROSS_MARGIN_TRADING_ADDRESS, CrossMarginTrading.abi, wallet);
  const tokenAddresses = tokensPerNetwork[CHAIN_ID ?? '1'];

  if (PRICE_WINDOW) {
    const window = parseFloat(PRICE_WINDOW);
    for (const tokenId in tokenAddresses) {
      console.log();
      const priceDisp = await priceDisparity(tokenId);
      if (priceDisp > 1 + window || priceDisp < 1 - window) {
        const tx = await cmt.getCurrentPriceInPeg(tokenAddresses[tokenId], `1${'0'.repeat(18)}`, true);
        console.log(`Upddating price of ${tokenId}: ${tx.hash}`);
      }
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


// async function controlInPeg(tokens: string[], amounts:BigNumber[]) {
//   const cmt = new Contract(CROSS_MARGIN_TRADING_ADDRESS, CrossMarginTrading.abi, wallet);
//   const router = new Contract(MARGIN_ROUTER_ADDRESS, MarginRouter.abi, wallet);

//   let contractTotal = BigNumber.from('0');
//   let controlTotal = BigNumber.from('0');
//   for (let i = 0; tokens.length > i; i++) {
//     const fromContract = await cmt.viewCurrentPriceInPeg(tokens[i], amounts[i]);

//     const [name, namePath, ammPath] = liquiPaths[tokens[i]]; 
//     const path = namePath.map((tokenName) => tokenAddresses[tokenName]);
//     const amms = encodeAMMPath(ammPath);
  
//     const control = (await router.getAmountsOut(amounts[i], amms, path));
//     console.log(`${name}: ${fromContract.div(10 ** 6)} | ${control[control.length - 1].div(10 ** 6)}`);

//     contractTotal = contractTotal.add(fromContract);
//     controlTotal = controlTotal.add(control[control.length - 1]);
//   }
//   console.log(`Total: ${contractTotal.div(10 ** 6)} | ${controlTotal.div(10 ** 6)}`);
// }

// async function controlAccount(accountAddress:string) {
//   const cmt = new Contract(CROSS_MARGIN_TRADING_ADDRESS, CrossMarginTrading.abi, wallet);
//   let [tokens, amounts] = await cmt.getHoldingAmounts(accountAddress);
//   console.log(`Holdings for ${accountAddress}:`);
//   await controlInPeg(tokens, amounts);
//   [tokens, amounts] = await cmt.getBorrowAmounts(accountAddress);
//   console.log(`Loans for ${accountAddress}:`);
//   await controlInPeg(tokens, amounts);
// }