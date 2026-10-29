# Community Decision Voting Platform

## INTE2628/2679 – Developing Blockchain Applications
### Assignment 2 – Decision Voting Platform

A browser-based blockchain voting platform built using Solidity, Web3.js, MetaMask and the Ethereum Sepolia test network.

The application allows an Admin to create and manage voting rounds while the participants can connect their MetaMask wallets, view the current voting session, cast one vote, view their own vote, and receive feedback about their eligibility and voting status.

---

## 1. Project Overview

The Community Decision Voting Platform is a decentralised voting application designed to support repeated decision-making activities.

The smart contract manages:

- Admin assignment
- Voting round preparation
- Text-based voting options
- Participant eligibility
- Voting
- Duplicate-vote prevention
- Ending voting
- Result revelation
- Winner calculation
- Result viewing
- Resetting the voting round

The frontend provides a single-page interface that connects to the deployed smart contract through MetaMask and Web3.js.

---

## 2. Technologies Used

- **Solidity** – Smart contract development
- **Web3.js** – Frontend-to-blockchain communication
- **MetaMask** – Wallet connection and transaction confirmation
- **Ethereum Sepolia Testnet** – Blockchain network
- **HTML** – Frontend structure
- **CSS** – Interface styling
- **JavaScript** – Frontend logic
- **Remix IDE** – Smart contract compilation and deployment

---

## 3. Project Structure

```text
src/
├── application.js       # Frontend JavaScript and Web3.js interaction
├── contract.sol         # CommunityVoting smart contract
├── index.html           # Main browser interface
├── styles.css           # Frontend styling
├── web3.min.js          # Web3.js library
└── README.md            # Project documentation

---

## 4. Main Features

### Admin

- Prepare a voting round
- Set the voting topic and options
- Exclude and reinstate participants
- View the excluded participant list
- Check participant voting status
- End voting
- Reveal results
- Reset the voting round
- Admin cannot vote

### Participants

- Connect MetaMask wallet
- View the voting topic and options
- Check eligibility
- Cast one vote per round
- View their own vote
- View results after they are revealed

---

## 5. Voting Lifecycle

```text
Prepare Voting Round
        ↓
Voting Active
        ↓
Participants Vote
        ↓
End Voting
        ↓
Reveal Results
        ↓
View Results
        ↓
Reset Voting Round
        ↓
New Voting Round
```

---

## 6. Running the Application

### Step 1 - Deploy the Smart Contract

Open `contract.sol` in Remix IDE.

Use:

```text
Environment: Browser Extension / MetaMask
Network: Sepolia
Contract: CommunityVoting
```

Deploy the contract using the Admin MetaMask account.

The account that deploys the contract automatically becomes the Admin.

### Step 2 - Configure the Frontend

Open `application.js` and replace:

```javascript
const CONTRACT_ADDRESS = "0xcB6AB1AE0A8F3EC95D52a7908fA891d026880871";
```

with the deployed contract address.

### Step 3 - Run the Application

Open `index.html` using a local web server such as VS Code Live Server.

Connect MetaMask and select the Sepolia network.

---

## 7. Testing

The application can be tested using separate MetaMask accounts for the Admin and participants.

1. Admin prepares a voting round.
2. Admin manages participant eligibility.
3. Participants connect their wallets.
4. Participants cast their votes.
5. Participants can view their own vote.
6. Duplicate voting is prevented.
7. Admin ends voting.
8. Admin reveals the results.
9. Results display all options and vote counts.
10. Admin resets the voting round.

---

## 8. Network

**Ethereum Sepolia Testnet**
---

## 9. Contract Address

```text
0xcB6AB1AE0A8F3EC95D52a7908fA891d026880871
```

---

## 10. Team

**Member 1:** Valentino Osorio Schwarz - s4091514 

**Member 2:** Byreddy Srilekha - s4076074

**Canvas Submitter:** Valentino Osorio Schwarz - s4091514