# marginswap-liquidator

A script that:

1. collects all accounts that have interacted with the MarginSwap router
2. filters those accounts down to those that are liquidatable
3. and liquidates those accounts

### Setup

1. Run `npm install`
2. Create a file called `.env` in the root directory with the following keys in the following format:
```
ETHERSCAN_API_KEY=youretherscanapikey
INFURA_KEY=yourinfurakey
```

### Usage

To run on Kovan:
`npm run start-dev` 

To run on mainnet:
`npm run start-prod`
