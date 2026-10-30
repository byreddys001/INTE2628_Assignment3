## INTE2628/2679 – Developing Blockchain Applications
### Assignment 3 – Final Block chain Application

# Community Decision Voting dApp (Assignment 3)

A commit–reveal voting app on Ethereum Sepolia. Voters first submit a hidden hash of their vote, then reveal it once voting closes, and the smart contract only counts votes that match.

## Files
- `contract.sol` – Solidity smart contract (all the voting rules live here)
- `index.html` – the web page
- `application.js` – Web3.js code that talks to MetaMask and the contract
- `styles.css` – basic styling
- `web3.min.js` – Web3.js library

## How to run
1. Open `contract.sol` in Remix, compile it, and deploy it on **Sepolia** using Injected Provider (MetaMask). The wallet you deploy with becomes the Admin.
2. Copy the deployed contract address into `CONTRACT_ADDRESS` at the top of `application.js`.
3. Open `index.html` in a browser (or use a local server), connect MetaMask on Sepolia, and you're in.

You'll need some Sepolia ETH in each wallet you use.

## How an election works
1. **Setup** – Admin starts an election with a topic and options.
2. **Commit** – Admin adds eligible voters. Each voter picks an option and submits a hidden hash. The page saves a private receipt (option + salt), so keep it.
3. **Reveal** – Admin ends voting. Voters reveal using their receipt, and the contract checks it matches their hash.
4. **Finalized** – Admin publishes results. Anyone can view the counts, winners, audit list and the verification check.
5. **New election** – Admin can start a new one (or reset first). Old results stay stored.

## Roles
- **Admin** – manages the election and the voter list. Can't vote.
- **Voter** – must be on the eligible list and not excluded. One vote per election.
- **Anyone** – can view results and the audit once they're published.

## Good to know
- The contract enforces all the rules. The page only shows things and sends transactions, so buttons stay clickable to show the contract rejecting wrong actions.
- Don't lose your receipt. Without it you can't reveal your vote.
- Choices become public once voters reveal. Privacy covers the voting phase only.
- There's no reveal deadline, so ask voters to reveal before the Admin finalises. Anyone who hasn't revealed is recorded as "not revealed" and isn't counted.

## Tools
Solidity, Remix, MetaMask, Web3.js, HTML, JavaScript.