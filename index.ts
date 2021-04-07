import { List, Seq } from 'immutable';
import Web3 from 'web3';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import contractAddresses from '@marginswap/core-abi/addresses.json';

dotenv.config();

type address = string

const { ETHERSCAN_API_KEY, INFURA_KEY } = process.env;
const CONTRACT_ADDRESS: address = contractAddresses.kovan.MarginRouter;
const ETHERSCAN_URL = `http://api-kovan.etherscan.io/api?module=contract&action=getabi&address=${CONTRACT_ADDRESS}&apikey=${ETHERSCAN_API_KEY}`;
const web3 = new Web3(`wss://kovan.infura.io/ws/v3/${INFURA_KEY}`);

function getContract(contractUrl: address) {
  return fetch(contractUrl)
    .then(resp => resp.json())
    .then(result => JSON.parse(result.result))
    .then(abi => new web3.eth.Contract(abi, CONTRACT_ADDRESS));
}

async function getAccountAddresses(): Promise<List<address>> {
  return getContract(ETHERSCAN_URL)
    .then(contract => contract.getPastEvents('allEvents'))
    .then(events => Seq(events).map(event => event.address).toList());
}

export default async function main() {
  return getAccountAddresses()
    .then(results => results.forEach(console.log));
}

main().then(_ => process.exit());
