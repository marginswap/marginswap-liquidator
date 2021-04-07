import { List } from 'immutable';
import _ from 'lodash';
import Web3 from 'web3';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import contractAddresses from '@marginswap/core-abi/addresses.json';

dotenv.config();

const { ETHERSCAN_API_KEY, INFURA_KEY } = process.env;
const CONTRACT_ADDRESS: string = contractAddresses.kovan.MarginRouter;
const ETHERSCAN_URL = `http://api.etherscan.io/api?module=contract&action=getabi&address=${CONTRACT_ADDRESS}&apikey=${ETHERSCAN_API_KEY}`;
const web3 = new Web3(`wss://kovan.infura.io/ws/v3/${INFURA_KEY}`);

function getContract(contractUrl: string) {
  return fetch(contractUrl)
    .then(resp => resp.json())
    .then(j => {
      console.log(j);
      return j;
    })
    .then(abi => new web3.eth.Contract(abi, CONTRACT_ADDRESS));
}

async function getAccountAddresses(): Promise<List<string>> {
  return getContract(ETHERSCAN_URL)
    .then(contract => contract.getPastEvents('allEvents'))
    .then(events => _.map(events, event => event.address))
    .then(addresses => List(addresses));
}

export default function main() {
  getAccountAddresses().then(results => _.each(results, console.log));
}

main();
