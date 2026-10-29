// ============================================================
// Community Voting dApp - frontend (HTML + Web3.js + MetaMask)
// Commit-reveal voting on Sepolia.
// NOTE: this file only presents data and sends transactions.
// Every rule (roles, eligibility, phases, one vote each, vote
// validation, counting) is enforced by the smart contract.
// Buttons are never blocked by the page: if an action is not
// allowed, the contract rejects it and its reason is shown.
// ============================================================

// Paste the address of your NEWLY deployed contract here.
const CONTRACT_ADDRESS = "0xf8e81D47203A594245E36C48e151709F0C19fBe8";
const SEPOLIA_CHAIN_ID = 11155111;

// Phase names exactly as returned by getVotingStatus() in the contract.
const PHASES = ["Setup", "Commit Phase", "Reveal Phase", "Results Finalized"];

// Minimal ABI: only the functions this page uses.
const ABI = [
  { "inputs": [], "name": "admin", "outputs": [{ "type": "address" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "electionId", "outputs": [{ "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "votingTopic", "outputs": [{ "type": "string" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "getVotingStatus", "outputs": [{ "type": "string" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "getOptionList", "outputs": [{ "type": "string[]" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "name": "voter", "type": "address" }], "name": "isEligible", "outputs": [{ "type": "bool" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "name": "voter", "type": "address" }], "name": "isExcluded", "outputs": [{ "type": "bool" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "getEligibleVoters", "outputs": [{ "type": "address[]" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "getExcludedVoters", "outputs": [{ "type": "address[]" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "name": "voter", "type": "address" }], "name": "addEligibleVoter", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "name": "voter", "type": "address" }], "name": "removeEligibleVoter", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "name": "voter", "type": "address" }], "name": "excludeVoter", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "name": "voter", "type": "address" }], "name": "reinstateVoter", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "name": "topic", "type": "string" }, { "name": "votingOptions", "type": "string[]" }], "name": "prepareVotingRound", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "name": "commitment", "type": "bytes32" }], "name": "submitCommitment", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "name": "optionIndex", "type": "uint256" }, { "name": "salt", "type": "bytes32" }], "name": "revealVote", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "endVoting", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "finaliseResults", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "resetVotingRound", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "getMyVotingStatus", "outputs": [{ "name": "committed", "type": "bool" }, { "name": "revealed", "type": "bool" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "viewMyVote", "outputs": [{ "type": "string" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "getResults", "outputs": [{ "name": "names", "type": "string[]" }, { "name": "counts", "type": "uint256[]" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "getWinner", "outputs": [{ "type": "string[]" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "name": "pastElectionId", "type": "uint256" }], "name": "getElectionResults", "outputs": [{ "name": "names", "type": "string[]" }, { "name": "counts", "type": "uint256[]" }, { "name": "winners", "type": "string[]" }], "stateMutability": "view", "type": "function" },
  {
    "inputs": [{ "name": "pastElectionId", "type": "uint256" }],
    "name": "getElectionAudit",
    "outputs": [{
      "type": "tuple[]",
      "components": [
        { "name": "voter", "type": "address" },
        { "name": "commitment", "type": "bytes32" },
        { "name": "revealed", "type": "bool" }
      ]
    }],
    "stateMutability": "view",
    "type": "function"
  },
  { "inputs": [{ "name": "pastElectionId", "type": "uint256" }], "name": "getElectionSummary", "outputs": [{ "name": "committedCount", "type": "uint256" }, { "name": "revealedCount", "type": "uint256" }, { "name": "countedVotes", "type": "uint256" }, { "name": "resultHash", "type": "bytes32" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "name": "pastElectionId", "type": "uint256" }], "name": "verifyElectionResult", "outputs": [{ "type": "bool" }], "stateMutability": "view", "type": "function" }
];

// ---------- Page state ----------
let web3;
let contract;
let account = null;
let isAdmin = false;
let electionId = "0";
let options = [];
let currentStatus = "Setup";

const $ = id => document.getElementById(id);

// Show text in one of the message boxes.
function message(id, text) {
  $(id).textContent = text || "";
}

// Returns true (and shows a message) if no wallet is connected yet.
function needWallet(outputId) {
  if (contract && account) return false;
  message(outputId, "Connect your wallet first.");
  return true;
}

// Receipts are stored per contract, election and wallet.
function receiptKey(id = electionId, wallet = account) {
  return `community-voting:${CONTRACT_ADDRESS}:${id}:${wallet.toLowerCase()}`;
}

// Turn a Web3 / MetaMask error into readable text (includes the contract revert reason).
function getError(error) {
  const text = error?.data?.message || error?.cause?.message || error?.message || String(error);
  return text.replace(/^Error:\s*/, "");
}

// Must match the Solidity formula exactly:
// keccak256(abi.encode(electionId, voter, optionIndex, salt))
function computeCommitment(id, voter, optionIndex, salt) {
  const encoded = web3.eth.abi.encodeParameters(
    ["uint256", "address", "uint256", "bytes32"],
    [String(id), voter, String(optionIndex), salt]
  );
  return web3.utils.keccak256(encoded);
}

// ---------- Clearing the screen ----------
function clearAccountScreen() {
  ["receiptDisplay", "voterMessage", "adminMessage", "globalMessage",
   "eligibleListResult", "excludedListResult", "auditDisplay", "resultsDisplay"]
    .forEach(id => { $(id).textContent = ""; });

  ["topicInput", "optionsInput", "eligibilityAddress", "historyElectionId", "receiptImport"]
    .forEach(id => { $(id).value = ""; });

  document.querySelectorAll('input[name="voteOption"]').forEach(input => {
    input.checked = false;
  });
}

function clearWalletScreen() {
  $("walletAddress").textContent = "Not connected";
  $("userRole").textContent = "-";
  $("networkInfo").textContent = "-";
  $("votingStatus").textContent = "-";
  $("electionIdDisplay").textContent = "-";
  $("topicDisplay").textContent = "-";
  $("phaseTrack").textContent = "";
  $("actionGuide").textContent = "";
  $("optionsDisplay").textContent = "Connect your wallet to load the election.";
  $("roleNotice").textContent = "Connect MetaMask to continue.";
  $("eligibilityStatus").textContent = "-";
  $("commitStatus").textContent = "-";
  $("revealStatus").textContent = "-";
  clearAccountScreen();
}

// ---------- Wallet connection ----------
async function connectWallet() {
  try {
    if (!window.ethereum) {
      throw new Error("Please install or enable MetaMask.");
    }

    if (CONTRACT_ADDRESS === "REPLACE_WITH_YOUR_NEW_DEPLOYED_CONTRACT_ADDRESS") {
      throw new Error("Add your deployed contract address to application.js first.");
    }

    web3 = new Web3(window.ethereum);

    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });

    if (!accounts.length) {
      throw new Error("No wallet account selected.");
    }

    account = accounts[0];
    contract = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);

    await refresh();
    message("globalMessage", "Wallet connected.");
  } catch (error) {
    message("globalMessage", getError(error));
  }
}

// ---------- Reload all data from the contract and update the page ----------
async function refresh() {
  if (!contract || !account) return;

  try {
    const [admin, status, id, topic, names, eligible, excluded, myStatus, chainId] =
      await Promise.all([
        contract.methods.admin().call(),
        contract.methods.getVotingStatus().call(),
        contract.methods.electionId().call(),
        contract.methods.votingTopic().call(),
        contract.methods.getOptionList().call(),
        contract.methods.isEligible(account).call(),
        contract.methods.isExcluded(account).call(),
        contract.methods.getMyVotingStatus().call({ from: account }),
        web3.eth.getChainId()
      ]);

    electionId = String(id);
    currentStatus = status;
    options = Array.from(names);
    isAdmin = admin.toLowerCase() === account.toLowerCase();

    const committed = Boolean(myStatus[0]);
    const revealed = Boolean(myStatus[1]);

    // A voter can see only their own counted vote.
    let myVoteText = "";
    if (revealed) {
      try {
        myVoteText = await contract.methods.viewMyVote().call({ from: account });
      } catch {
        myVoteText = "";
      }
    }

    $("walletAddress").textContent = account;
    $("userRole").textContent = isAdmin ? "Admin" : "Participant (voter)";
    $("networkInfo").textContent =
      Number(chainId) === SEPOLIA_CHAIN_ID ? "Sepolia" : `Chain ID ${chainId} (switch to Sepolia)`;
    $("votingStatus").textContent = status;
    $("electionIdDisplay").textContent = electionId;
    $("topicDisplay").textContent = topic || "No election prepared";

    $("eligibilityStatus").textContent = isAdmin
      ? "Admin cannot vote"
      : excluded
        ? "Excluded"
        : eligible
          ? "Eligible"
          : "Not on the eligibility list";

    $("commitStatus").textContent = committed ? "Yes" : "No";
    $("revealStatus").textContent = revealed
      ? `Yes${myVoteText ? ` (counted for: ${myVoteText})` : ""}`
      : "No";

    renderPhaseTrack(status);
    renderOptions();
    updateGuidance(status, Boolean(eligible), Boolean(excluded), committed, revealed);
  } catch (error) {
    message("globalMessage", `Could not load contract data: ${getError(error)}`);
  }
}

// Shows Setup -> Commit -> Reveal -> Finalized with the current phase highlighted.
function renderPhaseTrack(status) {
  const track = $("phaseTrack");
  track.textContent = "";

  PHASES.forEach((phaseName, index) => {
    const span = document.createElement("span");
    span.textContent = phaseName;
    if (phaseName === status) span.className = "current";
    track.appendChild(span);

    if (index < PHASES.length - 1) {
      track.appendChild(document.createTextNode("  →  "));
    }
  });
}

// Shows the option list and the radio buttons used for voting.
function renderOptions() {
  $("optionsDisplay").textContent = "";

  if (!options.length) {
    $("optionsDisplay").textContent = "No options have been prepared.";
    $("voteOptions").textContent = "";
    return;
  }

  options.forEach((option, index) => {
    const item = document.createElement("div");
    item.className = "option-item";
    item.textContent = `${index + 1}. ${option}`;
    $("optionsDisplay").appendChild(item);
  });

  $("voteOptions").textContent = "";

  options.forEach((option, index) => {
    const label = document.createElement("label");
    label.className = "option-item";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "voteOption";
    radio.value = String(index);

    label.appendChild(radio);
    label.appendChild(document.createTextNode(` ${option}`));
    $("voteOptions").appendChild(label);
  });
}

// ---------- Allowed / restricted guidance ----------
function renderGuide(allowed, restricted) {
  const box = $("actionGuide");
  box.textContent = "";

  [["Allowed now", allowed, "allowed"], ["Restricted now", restricted, "restricted"]]
    .forEach(([title, items, cssClass]) => {
      const column = document.createElement("div");
      column.className = `guide-col ${cssClass}`;

      const heading = document.createElement("strong");
      heading.textContent = title;
      column.appendChild(heading);

      const list = document.createElement("ul");
      (items.length ? items : ["Nothing"]).forEach(text => {
        const li = document.createElement("li");
        li.textContent = text;
        list.appendChild(li);
      });

      column.appendChild(list);
      box.appendChild(column);
    });
}

// Explains what the connected wallet may and may not do in the current phase.
// This is guidance only; the contract is what actually enforces it.
function updateGuidance(status, eligible, excluded, committed, revealed) {
  const setup = status === "Setup";
  const committing = status === "Commit Phase";
  const revealing = status === "Reveal Phase";
  const finalised = status === "Results Finalized";
  const allowed = [];
  const restricted = [];
  let hint;

  if (isAdmin) {
    hint = "Admin account: manage eligibility and the election lifecycle. The Admin cannot vote.";

    if (setup) {
      allowed.push("Start a new election (topic and options)");
      restricted.push("Eligibility changes (Commit phase only)", "End voting (Commit phase only)",
        "Finalise (Reveal phase only)", "Reset (after finalisation only)");
    } else if (committing) {
      allowed.push("Add / remove eligible participants", "Exclude / reinstate participants", "End voting");
      restricted.push("Start another election (finish this one first)", "Finalise (needs the Reveal phase)",
        "Voting (the Admin cannot vote)");
    } else if (revealing) {
      allowed.push("Finalise and publish results");
      restricted.push("Eligibility changes (Commit phase is over)", "End voting (already ended)",
        "Start another election (finalise first)");
    } else if (finalised) {
      allowed.push("Start a new election", "Reset to Setup", "View results and audit");
      restricted.push("Eligibility changes", "End voting / finalise again");
    }
  } else {
    hint = "Participant account: Admin actions will be rejected by the contract.";
    allowed.push("View your own voting status");
    restricted.push("All Admin actions (Admin wallet only)");

    if (committing) {
      if (excluded) restricted.push("Voting (you are excluded)");
      else if (!eligible) restricted.push("Voting (you are not on the eligibility list)");
      else if (committed) restricted.push("Voting again (one vote per election)");
      else allowed.push("Submit one secret commitment");
      restricted.push("Reveal (opens after the Admin ends voting)", "Results (published after finalisation)");
    } else if (revealing) {
      if (committed && !revealed) allowed.push("Reveal your vote using your receipt");
      else if (revealed) restricted.push("Reveal again (already revealed)");
      else restricted.push("Reveal (you did not submit a commitment)");
      restricted.push("New commitments (Commit phase is over)", "Results (not finalised yet)");
    } else if (finalised) {
      allowed.push("View published results and audit");
      restricted.push("Voting (this election is finished)");
    } else {
      restricted.push("Voting (no election is open)");
    }
  }

  $("roleNotice").textContent = hint;
  renderGuide(allowed, restricted);
}

// ---------- Sending transactions through MetaMask ----------
async function send(method, successText, outputId) {
  try {
    message(outputId, "Waiting for MetaMask confirmation...");
    const receipt = await method.send({ from: account });
    message(outputId, `${successText}\nTransaction: ${receipt.transactionHash}`);
    await refresh();
    return receipt;
  } catch (error) {
    // Includes the contract's revert reason, for example "Admin only".
    message(outputId, `Rejected: ${getError(error)}`);
    return null;
  }
}

// ---------- Admin: election management ----------
async function prepareElection() {
  if (needWallet("adminMessage")) return;

  const topic = $("topicInput").value.trim();
  const votingOptions = $("optionsInput").value
    .split("\n")
    .map(value => value.trim())
    .filter(Boolean);

  // Basic input check (the contract validates these too).
  if (!topic || votingOptions.length < 2) {
    return message("adminMessage", "Enter a topic and at least two options.");
  }

  const receipt = await send(
    contract.methods.prepareVotingRound(topic, votingOptions),
    "Election started successfully.",
    "adminMessage"
  );

  if (receipt) {
    $("topicInput").value = "";
    $("optionsInput").value = "";
  }
}

// ---------- Admin: eligibility ----------
async function manageEligibility(action) {
  if (needWallet("adminMessage")) return;

  const address = $("eligibilityAddress").value.trim();

  if (!web3.utils.isAddress(address)) {
    return message("adminMessage", "Enter a valid wallet address.");
  }

  const method = action === "add"
    ? contract.methods.addEligibleVoter(address)
    : contract.methods.removeEligibleVoter(address);

  const successText = action === "add"
    ? "Participant added to the eligibility list."
    : "Participant removed from the eligibility list.";

  const receipt = await send(method, successText, "adminMessage");

  if (receipt) {
    $("eligibilityAddress").value = "";
    await loadEligible();
  }
}

// ---------- Admin: exclusion ----------
async function manageExclusion(action) {
  if (needWallet("adminMessage")) return;

  const address = $("eligibilityAddress").value.trim();

  if (!web3.utils.isAddress(address)) {
    return message("adminMessage", "Enter a valid wallet address.");
  }

  const method = action === "exclude"
    ? contract.methods.excludeVoter(address)
    : contract.methods.reinstateVoter(address);

  const receipt = await send(
    method,
    action === "exclude" ? "Participant excluded." : "Participant reinstated.",
    "adminMessage"
  );

  if (receipt) {
    $("eligibilityAddress").value = "";
    await loadExcluded();
  }
}

async function loadEligible() {
  if (needWallet("eligibleListResult")) return;

  try {
    const list = await contract.methods.getEligibleVoters().call({ from: account });
    $("eligibleListResult").textContent = list.length
      ? list.join("\n")
      : "No eligible participants have been added.";
  } catch (error) {
    message("eligibleListResult", `Rejected: ${getError(error)}`);
  }
}

async function loadExcluded() {
  if (needWallet("excludedListResult")) return;

  try {
    const list = await contract.methods.getExcludedVoters().call({ from: account });
    $("excludedListResult").textContent = list.length
      ? list.join("\n")
      : "No excluded participants.";
  } catch (error) {
    message("excludedListResult", `Rejected: ${getError(error)}`);
  }
}

// ---------- Voter: commit phase ----------
async function commitVote() {
  if (needWallet("voterMessage")) return;

  const selected = document.querySelector('input[name="voteOption"]:checked');

  if (!selected) {
    return message("voterMessage", "Select an option first.");
  }

  try {
    const index = Number(selected.value);

    // Random 32-byte secret salt. Without it nobody can guess the vote from the hash.
    const salt = web3.utils.randomHex(32);
    const commitment = computeCommitment(electionId, account, index, salt);

    const privateReceipt = {
      electionId,
      voter: account,
      optionIndex: index,
      option: options[index],
      salt,
      commitment
    };

    // Save the receipt BEFORE sending the transaction so it cannot be lost
    // if the tab closes after confirmation. If the contract rejects the
    // transaction (for example a duplicate vote), the old receipt is restored.
    const key = receiptKey();
    const previous = localStorage.getItem(key);
    localStorage.setItem(key, JSON.stringify(privateReceipt));

    const receipt = await send(
      contract.methods.submitCommitment(commitment),
      "Commitment submitted. Your choice is hidden on-chain. Keep your private receipt.",
      "voterMessage"
    );

    if (!receipt) {
      if (previous === null) localStorage.removeItem(key);
      else localStorage.setItem(key, previous);
      return;
    }

    showReceipt(privateReceipt);
  } catch (error) {
    message("voterMessage", getError(error));
  }
}

// ---------- Voter: private receipt ----------
function showPrivateReceipt() {
  if (needWallet("receiptDisplay")) return;

  const saved = localStorage.getItem(receiptKey());

  if (!saved) {
    return message(
      "receiptDisplay",
      "No receipt is saved in this browser for this wallet and election."
    );
  }

  try {
    showReceipt(JSON.parse(saved));
  } catch {
    message("receiptDisplay", "The saved receipt could not be read.");
  }
}

function showReceipt(receipt) {
  $("receiptDisplay").textContent =
    `Election ID: ${receipt.electionId}\n` +
    `Your choice: ${receipt.option}\n` +
    `Option index: ${receipt.optionIndex}\n` +
    `Salt: ${receipt.salt}\n` +
    `Commitment: ${receipt.commitment}\n\n` +
    "Keep this receipt private. You need the option index and salt to reveal.";
}

// Download the receipt as a JSON file (backup in case the browser data is lost).
function downloadReceipt() {
  if (needWallet("receiptDisplay")) return;

  const saved = localStorage.getItem(receiptKey());

  if (!saved) {
    return message("receiptDisplay", "No receipt is saved in this browser for this wallet and election.");
  }

  const blob = new Blob([saved], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `voting-receipt-election-${electionId}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

// Restore a downloaded receipt. It must belong to this wallet and election,
// and its commitment must match the hash recomputed from its own option and salt.
function importReceipt() {
  if (needWallet("voterMessage")) return;

  try {
    const imported = JSON.parse($("receiptImport").value.trim());

    if (
      String(imported.voter).toLowerCase() !== account.toLowerCase() ||
      String(imported.electionId) !== electionId
    ) {
      return message("voterMessage", "This receipt belongs to another wallet or election.");
    }

    const recomputed = computeCommitment(
      imported.electionId, imported.voter, imported.optionIndex, imported.salt
    );

    if (recomputed.toLowerCase() !== String(imported.commitment).toLowerCase()) {
      return message("voterMessage", "This receipt is invalid: its commitment does not match.");
    }

    localStorage.setItem(receiptKey(), JSON.stringify(imported));
    showReceipt(imported);
    message("voterMessage", "Receipt restored.");
    $("receiptImport").value = "";
  } catch {
    message("voterMessage", "Could not read that receipt. Paste the full JSON file content.");
  }
}

// ---------- Voter: reveal phase ----------
async function revealMyVote() {
  if (needWallet("voterMessage")) return;

  const saved = localStorage.getItem(receiptKey());

  if (!saved) {
    return message(
      "voterMessage",
      "Receipt not found. You need your original option and salt to reveal."
    );
  }

  try {
    const receipt = JSON.parse(saved);

    if (
      receipt.voter.toLowerCase() !== account.toLowerCase() ||
      String(receipt.electionId) !== electionId
    ) {
      return message("voterMessage", "This receipt belongs to another wallet or election.");
    }

    // The contract recomputes the hash and accepts the vote only if it matches the commitment.
    await send(
      contract.methods.revealVote(receipt.optionIndex, receipt.salt),
      "Reveal transaction confirmed. The contract validated your commitment.",
      "voterMessage"
    );
  } catch (error) {
    message("voterMessage", getError(error));
  }
}

// ---------- Admin: lifecycle ----------
async function endVoting() {
  if (needWallet("adminMessage")) return;

  await send(
    contract.methods.endVoting(),
    "Voting has ended. Participants who committed can now reveal their votes.",
    "adminMessage"
  );
}

async function finalise() {
  if (needWallet("adminMessage")) return;

  await send(
    contract.methods.finaliseResults(),
    "Results, audit records and result hash published on-chain.",
    "adminMessage"
  );
}

async function resetElection() {
  if (needWallet("adminMessage")) return;

  const receipt = await send(
    contract.methods.resetVotingRound(),
    "Election reset to Setup. Historical results remain saved.",
    "adminMessage"
  );

  if (receipt) {
    $("resultsDisplay").textContent = "";
    $("auditDisplay").textContent = "";
    $("resultsStatus").textContent = "Previous results remain available by election ID.";
  }
}

// ---------- Results and audit ----------
function getRequestedElectionId() {
  const value = $("historyElectionId").value.trim();
  return value || electionId;
}

async function loadResults() {
  if (needWallet("resultsDisplay")) return;

  const requestedId = getRequestedElectionId();

  try {
    let names, counts, winners, result;

    // Contract functions with several return values give an OBJECT in Web3.js, not an array,
    // so they are read by name (or by index) instead of array destructuring.
    if (requestedId === electionId && currentStatus === "Results Finalized") {
      result = await contract.methods.getResults().call();
      names = result.names ?? result[0];
      counts = result.counts ?? result[1];
      winners = await contract.methods.getWinner().call();
    } else {
      result = await contract.methods.getElectionResults(requestedId).call();
      names = result.names ?? result[0];
      counts = result.counts ?? result[1];
      winners = result.winners ?? result[2];
    }

    names = Array.from(names);
    counts = Array.from(counts).map(String);
    winners = Array.from(winners);

    // On-chain evidence recorded at finalisation.
    const summary = await contract.methods.getElectionSummary(requestedId).call();
    const committedCount = String(summary.committedCount ?? summary[0]);
    const revealedCount = String(summary.revealedCount ?? summary[1]);
    const countedVotes = String(summary.countedVotes ?? summary[2]);
    const storedHash = String(summary.resultHash ?? summary[3]);

    // Check 1: the contract re-verifies the audit list, counts and hash itself.
    const contractVerified = await contract.methods.verifyElectionResult(requestedId).call();

    // Check 2: recompute the hash in the browser from the displayed data and compare.
    const localHash = web3.utils.keccak256(
      web3.eth.abi.encodeParameters(
        ["uint256", "string[]", "uint256[]"],
        [String(requestedId), names, counts]
      )
    );
    const hashMatches = localHash.toLowerCase() === storedHash.toLowerCase();

    const lines = names.map((name, index) => `${name}: ${counts[index]} vote(s)`);

    lines.push(
      "",
      `Winner(s): ${winners.length ? winners.join(", ") : "No valid votes"}`,
      "",
      "Verification",
      `Voters who committed: ${committedCount}`,
      `Valid reveals counted: ${revealedCount}`,
      `Sum of published counts: ${countedVotes}`,
      `Contract consistency check: ${contractVerified ? "PASSED" : "FAILED"}`,
      `Result hash matches published data: ${hashMatches ? "YES" : "NO"}`,
      `Result hash: ${storedHash}`
    );

    $("resultsStatus").textContent = `Results loaded for election ${requestedId}.`;
    $("resultsDisplay").textContent = lines.join("\n");
  } catch (error) {
    $("resultsStatus").textContent = "Could not load results.";
    message(
      "resultsDisplay",
      `Results for election ${requestedId} may not be finalised or saved.\n${getError(error)}`
    );
  }
}

async function loadAudit() {
  if (needWallet("auditDisplay")) return;

  const requestedId = getRequestedElectionId();

  try {
    const rows = await contract.methods.getElectionAudit(requestedId).call();

    if (!rows.length) {
      $("auditDisplay").textContent = "No audit records are available (nobody committed).";
      return;
    }

    // The audit lists participation only. Choices and salts are not published here.
    $("auditDisplay").textContent =
      `Audit records for election ${requestedId}\n\n` +
      Array.from(rows).map((row, index) => {
        const voter = row.voter ?? row[0];
        const commitment = row.commitment ?? row[1];
        const revealed = row.revealed ?? row[2];

        return (
          `${index + 1}. Voter: ${voter}\n` +
          `Status: ${revealed ? "Revealed and counted" : "Not revealed (not counted)"}\n` +
          `Commitment: ${commitment}`
        );
      }).join("\n\n");
  } catch (error) {
    message(
      "auditDisplay",
      `Audit for election ${requestedId} is unavailable until it is finalised.\n${getError(error)}`
    );
  }
}

// ---------- Button wiring ----------
$("connectButton").addEventListener("click", connectWallet);
$("prepareButton").addEventListener("click", prepareElection);

$("addEligibleButton").addEventListener("click", () => manageEligibility("add"));
$("removeEligibleButton").addEventListener("click", () => manageEligibility("remove"));
$("eligibleListButton").addEventListener("click", loadEligible);

$("excludeButton").addEventListener("click", () => manageExclusion("exclude"));
$("reinstateButton").addEventListener("click", () => manageExclusion("reinstate"));
$("excludedListButton").addEventListener("click", loadExcluded);

$("commitButton").addEventListener("click", commitVote);
$("receiptButton").addEventListener("click", showPrivateReceipt);
$("downloadReceiptButton").addEventListener("click", downloadReceipt);
$("importReceiptButton").addEventListener("click", importReceipt);
$("revealButton").addEventListener("click", revealMyVote);

$("endButton").addEventListener("click", endVoting);
$("finaliseButton").addEventListener("click", finalise);
$("resetButton").addEventListener("click", resetElection);

$("loadResultsButton").addEventListener("click", loadResults);
$("loadAuditButton").addEventListener("click", loadAudit);

// React to wallet changes.
if (window.ethereum) {
  window.ethereum.on("accountsChanged", async accounts => {
    clearAccountScreen();
    account = accounts[0] || null;

    if (!account) {
      clearWalletScreen();
      return;
    }

    await refresh();
  });

  window.ethereum.on("chainChanged", () => {
    window.location.reload();
  });
}