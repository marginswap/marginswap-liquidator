# marginswap-liquidator

A script that:

1. collects all accounts that have interacted with the MarginSwap router
2. filters those accounts down to those that are liquidatable
3. and liquidates those accounts

### Setup

0. Place a private key in `~/.marginswap-secret`
1. Run `npm install`
2. Create a file called `.env` in the root directory with the following keys in the following format:

```
NODE_URL=https://yourinfuraoralchemyorsomething.node
CHAIN_ID=1

# optional parameters:
# window facto within which to update prices
PRICE_WINDOW=0.1
# minimum loan amount for which to trigger liquidation
MINIMUM_LOAN_USD=5
```

### Usage

`npm run liquidate`
