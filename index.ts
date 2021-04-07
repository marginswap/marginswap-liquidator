import { List, Seq } from 'immutable';
import Web3 from 'web3';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import contractAddresses from '@marginswap/core-abi/addresses.json';

dotenv.config();

type address = string

const { ETHERSCAN_API_KEY, INFURA_KEY } = process.env;
const MARGIN_ROUTER_ADDRESS: address = contractAddresses.kovan.MarginRouter;
const CROSS_MARGIN_TRADING_ADDRESS: address = contractAddresses.kovan.CrossMarginTrading;
const ETHERSCAN_BASE_URL = `http://api-kovan.etherscan.io/api?module=contract&action=getabi&apikey=${ETHERSCAN_API_KEY}`;
const web3 = new Web3(`wss://kovan.infura.io/ws/v3/${INFURA_KEY}`);

function etherscanUrl(contract: address): string {
  return `${ETHERSCAN_BASE_URL}&address=${contract}`;
}

function getContract(contractUrl: string, contractAddr: address) {
  return fetch(contractUrl)
    .then(resp => resp.json())
    .then(result => JSON.parse(result.result))
    .then(abi => new web3.eth.Contract(abi, contractAddr));
}

function getCrossMarginTrading() {
  const url = etherscanUrl(CROSS_MARGIN_TRADING_ADDRESS);
  return getContract(url, CROSS_MARGIN_TRADING_ADDRESS);
}

function getAccountAddresses(): Promise<List<address>> {
  const url = etherscanUrl(MARGIN_ROUTER_ADDRESS);
  return getContract(url, MARGIN_ROUTER_ADDRESS)
    .then(marginRouter => marginRouter.getPastEvents('allEvents'))
    .then(events => Seq(events).map(event => event.address).toList());
}

function canBeLiquidated(account: address): Promise<boolean> {
  return getCrossMarginTrading()
    .then(cmt => cmt.methods.canBeLiquidated(account));
}

function filterLiquifiable(accounts: List<address>): Promise<List<address>> {
  return Promise.all(accounts.map(canBeLiquidated))
    .then(statuses => accounts.zipAll(List(statuses)))
    .then(results => results.filter(([_, liquifiable]) => liquifiable))
    .then(results => results.map(([acct, _]) => acct));
}

function liquidateAccounts(accounts: List<address>) {
  return getCrossMarginTrading()
    .then(cmt => cmt.methods.liquidate(accounts));
}

export default function main() {
  return getAccountAddresses()
    .then(filterLiquifiable)
    .then(liquidateAccounts);
}

main().then(_ => process.exit());
