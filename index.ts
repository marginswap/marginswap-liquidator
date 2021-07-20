/* eslint-disable quote-props */
/* eslint-disable no-console */
import {
  Contract, utils, providers, Wallet, BigNumber,
} from 'ethers';
import dotenv from 'dotenv';
import contractAddresses from '@marginswap/core-abi/addresses.json';
import MarginRouter from '@marginswap/core-abi/artifacts/contracts/MarginRouter.sol/MarginRouter.json';
import CrossMarginTrading from '@marginswap/core-abi/artifacts/contracts/CrossMarginTrading.sol/CrossMarginTrading.json';
import fs from 'fs';
import { getAddress } from '@ethersproject/address';
import path from 'path';
import addresses from './addresses.json';

dotenv.config();

enum AMMs {
  UNISWAP,
  SUSHISWAP
}

function encodeAMMPath(ammPath: AMMs[]) {
  const encoded = utils.hexlify(ammPath.map((amm: AMMs) => (amm === AMMs.UNISWAP ? 0 : 1)));
  return `${encoded}${'0'.repeat(64 + 2 - encoded.length)}`;
}

const baseCurrency: Record<string, string> = {
  '42': 'WETH',
  '1': 'WETH',
  '137': 'WMATIC',
  '43114': 'WAVAX',
  '31337': 'WETH',
  '56': 'WBNB',
};

export const tokensPerNetwork: Record<string, Record<string, string>> = {
  42: {
    //    USDT: USDT_ADDRESS,
    DAI: '0x4f96fe3b7a6cf9725f59d353f723c1bdb64ca6aa',
    WETH: '0xd0a1e359811322d97991e03f863a0c30c2cf029c',
    UNI: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
    //    MKR: "0xac94ea989f6955c67200dd67f0101e1865a560ea",
  },
  1: {
    DAI: '0x6b175474e89094c44da98b954eedeac495271d0f',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    UNI: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
    MKR: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    // BOND: '0x0391D2021f89DC339F60Fff84546EA23E337750f',
    LINK: '0x514910771af9ca656af840dff83e8264ecf986ca',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    SUSHI: '0x6b3595068778dd592e39a122f4f5a5cf09c90fe2',
    ALCX: '0xdbdb4d16eda451d0503b854cf79d55697f90c8df',
  },
  31337: {
    DAI: '0x6b175474e89094c44da98b954eedeac495271d0f',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    ALCX: '0xdbdb4d16eda451d0503b854cf79d55697f90c8df',
    UNI: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
  },
  43114: {
    WAVAX: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    ETH: '0xf20d962a6c8f70c731bd838a3a388D7d48fA6e15',
    PNG: '0x60781C2586D68229fde47564546784ab3fACA982',
    WBTC: '0x408D4cD0ADb7ceBd1F1A1C33A0Ba2098E1295bAB',
    USDT: '0xde3A24028580884448a5397872046a019649b084',
  },
  137: {
    USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    WBTC: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
    DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
    WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    LINK: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39',
    AAVE: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B',
  },
  56: {
    WBNB: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
    CAKE: '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82',
    ETH: '0x2170ed0880ac9a755fd29b2688956bd959f933f8',
    USDC: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
    BUSD: '0xe9e7cea3dedca5984780bafc599bd69add087d56',
    DAI: '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3',
    BTCB: '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c',
    USDT: '0x55d398326f99059ff775485246999027b3197955',
  },
};

type TokenInitRecord = {
  exposureCap: number;
  lendingBuffer: number;
  incentiveWeight: number;
  liquidationTokenPath: string[];
  decimals: number;
  ammPath?: AMMs[];
};

const tokenParams: { [tokenName: string]: TokenInitRecord; } = {
  WBNB: {
    exposureCap: 1000000,
    lendingBuffer: 10000,
    incentiveWeight: 3,
    liquidationTokenPath: ['WBNB'],
    decimals: 18,
  },
  CAKE: {
    exposureCap: 200000,
    lendingBuffer: 100,
    incentiveWeight: 1,
    liquidationTokenPath: ['CAKE', 'BASE'],
    decimals: 18,
  },
  BUSD: {
    exposureCap: 10000000,
    lendingBuffer: 10000,
    incentiveWeight: 3,
    liquidationTokenPath: ['BUSD', 'BASE'],
    decimals: 18,
  },
  BTCB: {
    exposureCap: 2000,
    lendingBuffer: 20,
    incentiveWeight: 3,
    liquidationTokenPath: ['BTCB', 'BASE'],
    decimals: 18,
  },
  DAI: {
    exposureCap: 10000000,
    lendingBuffer: 10000,
    incentiveWeight: 3,
    liquidationTokenPath: ['DAI', 'BASE'],
    decimals: 18,
  },
  WETH: {
    exposureCap: 100000,
    lendingBuffer: 500,
    incentiveWeight: 3,
    liquidationTokenPath: ['BASE'],
    decimals: 18,
  },
  UNI: {
    exposureCap: 100000,
    lendingBuffer: 500,
    incentiveWeight: 5,
    liquidationTokenPath: ['UNI', 'BASE'],
    decimals: 18,
  },
  MKR: {
    exposureCap: 2000,
    lendingBuffer: 80,
    incentiveWeight: 5,
    liquidationTokenPath: ['MKR', 'BASE'],
    decimals: 18,
  },
  USDT: {
    exposureCap: 100000000,
    lendingBuffer: 10000,
    incentiveWeight: 3,
    liquidationTokenPath: ['USDT', 'BASE'],
    decimals: 6,
  },
  BOND: {
    exposureCap: 50000,
    lendingBuffer: 100,
    incentiveWeight: 1,
    liquidationTokenPath: ['BOND', 'USDC'],
    decimals: 18,
  },
  LINK: {
    exposureCap: 200000,
    lendingBuffer: 100,
    incentiveWeight: 1,
    liquidationTokenPath: ['LINK', 'BASE'],
    decimals: 18,
    ammPath: [AMMs.UNISWAP, AMMs.UNISWAP],
  },
  USDC: {
    exposureCap: 100000000,
    lendingBuffer: 10000,
    incentiveWeight: 3,
    liquidationTokenPath: ['USDC', 'BASE'],
    decimals: 6,
  },
  WBTC: {
    exposureCap: 2000,
    lendingBuffer: 20,
    incentiveWeight: 3,
    liquidationTokenPath: ['WBTC', 'BASE'],
    decimals: 8,
  },
  SUSHI: {
    exposureCap: 300000,
    lendingBuffer: 4000,
    incentiveWeight: 1,
    liquidationTokenPath: ['SUSHI', 'BASE'],
    decimals: 18,
    ammPath: [AMMs.SUSHISWAP, AMMs.SUSHISWAP, AMMs.SUSHISWAP],
  },
  ALCX: {
    exposureCap: 10000,
    lendingBuffer: 100,
    incentiveWeight: 2,
    liquidationTokenPath: ['ALCX', 'BASE'],
    decimals: 18,
    ammPath: [AMMs.SUSHISWAP, AMMs.SUSHISWAP, AMMs.SUSHISWAP],
  },
  WAVAX: {
    exposureCap: 1000000,
    lendingBuffer: 10000,
    incentiveWeight: 3,
    liquidationTokenPath: ['WAVAX'],
    decimals: 18,
  },
  WMATIC: {
    exposureCap: 1000000,
    lendingBuffer: 10000,
    incentiveWeight: 3,
    liquidationTokenPath: ['WMATIC'],
    decimals: 18,
  },
  ETH: {
    exposureCap: 100000,
    lendingBuffer: 500,
    incentiveWeight: 3,
    liquidationTokenPath: ['ETH', 'BASE'],
    decimals: 18,
  },
  PNG: {
    exposureCap: 1000000,
    lendingBuffer: 1,
    incentiveWeight: 3,
    liquidationTokenPath: ['PNG', 'BASE'],
    decimals: 18,
  },
  AAVE: {
    exposureCap: 1000000,
    lendingBuffer: 1,
    incentiveWeight: 3,
    liquidationTokenPath: ['AAVE', 'BASE'],
    decimals: 18,
  },
};

const liquiPaths: Record<string, [string, string[], AMMs[]]> = {};

type address = string;

const {
  NODE_URL, CHAIN_ID, MINIMUM_LOAN_USD, PRICE_WINDOW,
} = process.env;

const targetChainId: '1' | '43114' | '137' | '56' = CHAIN_ID as unknown as '1' | '43114' | '137' | '56';
console.log(`target chain: ${targetChainId}, ${NODE_URL}`);

const pegDecimals = targetChainId === '56' ? utils.parseEther('1') : BigNumber.from(10 ** 6);

function replaceBase(tokenPath: string[]) {
  return tokenPath.map(tName => (tName === 'BASE' ? baseCurrency[targetChainId] : tName));
}

// eslint-disable-next-line no-restricted-syntax, guard-for-in
for (const name in tokensPerNetwork[targetChainId]) {
  liquiPaths[getAddress(tokensPerNetwork[targetChainId][name])] = [name, [...replaceBase(tokenParams[name].liquidationTokenPath), 'USDT'], tokenParams[name].ammPath ?? [AMMs.UNISWAP]];
}

const MINIMUM_LOAN_AMOUNT = `${MINIMUM_LOAN_USD ?? '5'}${'0'.repeat(6)}`;

if (!targetChainId) {
  console.log('Provide a valid chain id');
  process.exit();
}

const chainId: '1' | '42' = targetChainId as any;
const MARGIN_ROUTER_ADDRESS: address = contractAddresses[chainId].MarginRouter;
const CROSS_MARGIN_TRADING_ADDRESS: address = contractAddresses[chainId].CrossMarginTrading;

const homedir = require('os').homedir();

const privateKey = fs.readFileSync(`${homedir}/.marginswap-secret`).toString().trim();
const provider = new providers.JsonRpcProvider(NODE_URL);
const wallet = new Wallet(privateKey, provider);

async function getAccountAddresses() {
  const router = new Contract(MARGIN_ROUTER_ADDRESS, MarginRouter.abi, wallet);

  const addressRecord = addresses[targetChainId];

  const topic = utils.id('AccountUpdated(address)');
  const lastBlock = Math.min(
    await wallet.provider.getBlockNumber(), addressRecord.lastBlock + 10000 - 1,
  );
  const events = await router
    .queryFilter({
      address: MARGIN_ROUTER_ADDRESS,
      topics: [topic],
    }, addressRecord.lastBlock, lastBlock);

  const liquifiable = [];

  let totalLoan;
  let totalHoldings;

  const userAddresses: Set<string> = new Set(addressRecord.users);

  // eslint-disable-next-line no-restricted-syntax
  for (const event of events) {
    const account = event.args?.trader;
    if (account) {
      userAddresses.add(account);
    }
  }

  // eslint-disable-next-line no-restricted-syntax
  for (const account of userAddresses) {
    // eslint-disable-next-line no-await-in-loop, no-use-before-define
    const meta = await getAccountMetadata(account);
    if (meta) {
      const loan = meta.loan.div(pegDecimals);
      const holdings = meta.holdings.div(pegDecimals);
      if (meta.canBeLiquidated) {
        liquifiable.push(meta.address);
        totalLoan = totalLoan ? totalLoan.add(loan) : loan;
        totalHoldings = totalHoldings ? totalHoldings.add(holdings) : holdings;
      }

      if (holdings.gt(100)) {
        console.log(`${account}: ${holdings.toString()} / ${loan}`);
        if (loan.gt(holdings)) {
          console.log(`$${loan.sub(holdings).toString()} shortfall for ${account}`);
        }
      } else if (holdings.lt(5)) {
        userAddresses.delete(account);
      }
    }
  }

  // eslint-disable-next-line no-use-before-define
  await exportAddresses(Array.from(userAddresses), targetChainId, lastBlock);

  console.log(`To liquidate: Total holdings: ${totalHoldings}, total loan: ${totalLoan}`);

  return liquifiable;
}

async function getAccountMetadata(account: address):
  Promise<{
    address: string,
    loan: BigNumber,
    holdings: BigNumber,
    canBeLiquidated: boolean;
  } | undefined> {
  if (account) {
    const cmt = new Contract(CROSS_MARGIN_TRADING_ADDRESS, CrossMarginTrading.abi, wallet);
    const loan = await cmt.viewLoanInPeg(account);
    const holdings = await cmt.viewHoldingsInPeg(account);
    const canBeLiquidated = (await cmt.canBeLiquidated(account)) && loan.gt(MINIMUM_LOAN_AMOUNT);
    return {
      canBeLiquidated,
      address: account,
      loan,
      holdings,
    };
  }

  return undefined;
}

function liquidateAccounts(accounts: address[]) {
  const cmt = new Contract(CROSS_MARGIN_TRADING_ADDRESS, CrossMarginTrading.abi, wallet);
  // cmt.defaultCommon = {
  //   customChain: {name: 'hardhat', chainId: 1, networkId: 31337}, baseChain: 'mainnet'
  // };
  if (accounts.length > 0) {
    return cmt.liquidate(accounts, { gasLimit: 8000000 });
  }

  return undefined;
}

async function priceDisparity(name: string) {
  const router = new Contract(MARGIN_ROUTER_ADDRESS, MarginRouter.abi, wallet);
  const cmt = new Contract(CROSS_MARGIN_TRADING_ADDRESS, CrossMarginTrading.abi, wallet);
  const tokens = replaceBase(tokenParams[name].liquidationTokenPath);
  const tokenAddresses = tokensPerNetwork[targetChainId];
  tokens?.push('USDT');
  const tokenPath = tokens?.map(tokenName => tokenAddresses[tokenName]);
  const amms = encodeAMMPath(tokenParams[name].ammPath || [AMMs.UNISWAP]);
  // TODO - Gabe - please confirm that getAmountsIn can accept a string as the first arg
  const amountOut = pegDecimals.toString();
  const amountIn = (await router.getAmountsIn(amountOut, amms, tokenPath))[0];
  const currentPrice = (await cmt.viewCurrentPriceInPeg(tokenAddresses[name], amountIn));
  const oneOfToken = `1${'0'.repeat(tokenParams[name].decimals)}`;
  console.log((await cmt.viewCurrentPriceInPeg(tokenAddresses[name], oneOfToken)).div(pegDecimals));
  const outAmounts = (await router.getAmountsOut(oneOfToken, amms, tokenPath));
  console.log(outAmounts[outAmounts.length - 1].div(pegDecimals));
  return currentPrice.div(amountOut);
}

async function exportAddresses(users: string[], chainID: string, lastBlock: number) {
  let addressList: Record<string, { users: string[], lastBlock: number; }> = {};
  const addressesPath = path.join(__dirname, './addresses.json');
  if (fs.existsSync(addressesPath)) {
    addressList = JSON.parse((await fs.promises.readFile(addressesPath)).toString());
  }

  addressList[chainID] = {
    users,
    lastBlock,
  };
  const stringRepresentation = JSON.stringify(addresses, null, 2);

  await fs.promises.writeFile(addressesPath, stringRepresentation);
  console.log(`Wrote ${addressesPath}. New state:`);
  console.log(addresses);
}

export default async function main() {
  const cmt = new Contract(CROSS_MARGIN_TRADING_ADDRESS, CrossMarginTrading.abi, wallet);
  const tokenAddresses = tokensPerNetwork[targetChainId];

  if (PRICE_WINDOW) {
    const window = parseFloat(PRICE_WINDOW);
    // eslint-disable-next-line no-restricted-syntax, guard-for-in
    for (const tokenId in tokenAddresses) {
      console.log();
      // eslint-disable-next-line no-await-in-loop
      const priceDisp = await priceDisparity(tokenId);
      console.log(tokenId);
      if (priceDisp > 1 + window || priceDisp < 1 - window) {
        // eslint-disable-next-line no-await-in-loop
        const tx = await cmt.getCurrentPriceInPeg(tokenAddresses[tokenId], `1${'0'.repeat(18)}`, true, { gasLimit: 800000 });
        console.log(`Upddating price of ${tokenId}: ${tx.hash}`);
      }
    }
  }
  return getAccountAddresses()
    .then(liquifiableAccounts => {
      console.log('The following accounts are liquidatable:');
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
// eslint-disable-next-line max-len
//     console.log(`${name}: ${fromContract.div(pegDecimals)} | ${control[control.length - 1].div(pegDecimals)}`);

//     contractTotal = contractTotal.add(fromContract);
//     controlTotal = controlTotal.add(control[control.length - 1]);
//   }
//   console.log(`Total: ${contractTotal.div(pegDecimals)} | ${controlTotal.div(pegDecimals)}`);
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
