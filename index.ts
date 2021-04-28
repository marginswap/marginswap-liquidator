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

export default function main() {
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
