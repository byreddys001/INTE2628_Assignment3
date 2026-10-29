// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CommunityVoting
/// @notice Commit-reveal voting on a public blockchain.
///         Phase flow: Setup -> Commit -> Reveal -> Finalized.
///         - Commit: voters submit only a hash of (election, voter, choice, secret salt),
///           so choices and interim tallies are hidden from everyone, including the Admin.
///         - Reveal: voters open their commitment; the contract recomputes the hash,
///           and only matching reveals are counted.
///         - Finalized: the Admin publishes results, an audit list and a result hash.
/// @dev Privacy note: `private` variables and view restrictions do NOT hide data on a public
///      chain. Secrecy during voting comes from the commitment hash. Once a voter reveals,
///      the choice is visible in that transaction's calldata. That is inherent to commit-reveal.
contract CommunityVoting {
    // The Admin is fixed at deployment and cannot be changed.
    address public immutable admin;

    enum Phase {
        Setup,      // no active election
        Commit,     // voters submit secret commitments
        Reveal,     // voters reveal and the contract validates them
        Finalized   // results and audit are published
    }

    Phase private phase;
    uint256 public electionId;      // increases by 1 for every new election
    string public votingTopic;

    struct VotingOption {
        string optionText;
        uint256 voteCount;          // only increases during the Reveal phase
    }

    // Audit record: deliberately contains NO choice and NO salt.
    struct AuditRecord {
        address voter;
        bytes32 commitment;
        bool revealed;              // true = valid reveal, counted; false = not counted
    }

    // On-chain evidence that lets anyone check the published result.
    struct ElectionSummary {
        uint256 committedCount;     // voters who submitted a commitment
        uint256 revealedCount;      // voters whose reveal was valid
        uint256 countedVotes;       // sum of all option counts (must equal revealedCount)
        bytes32 resultHash;         // keccak256(electionId, option names, vote counts)
    }

    VotingOption[] private options; // options of the CURRENT election only

    // Per-election vote data: every mapping is keyed by electionId so elections stay independent.
    mapping(uint256 => mapping(address => bool)) private hasCommitted;
    mapping(uint256 => mapping(address => bytes32)) private commitments;
    mapping(uint256 => mapping(address => bool)) private hasRevealed;
    mapping(uint256 => mapping(address => uint256)) private revealedChoices;

    // Eligibility list (whitelist), per election.
    mapping(uint256 => mapping(address => bool)) private eligibleVoters;
    mapping(uint256 => address[]) private eligibleVoterList;

    // Optional exclusion list, per election.
    mapping(uint256 => mapping(address => bool)) private excludedVoters;
    mapping(uint256 => address[]) private excludedList;

    // Everyone who committed in each election (used to build the audit list).
    mapping(uint256 => address[]) private committedVoters;

    // Saved results, audit data and summaries; these are never overwritten by later elections.
    mapping(uint256 => string[]) private savedOptionNames;
    mapping(uint256 => uint256[]) private savedVoteCounts;
    mapping(uint256 => string[]) private savedWinners;
    mapping(uint256 => AuditRecord[]) private electionAudit;
    mapping(uint256 => ElectionSummary) private electionSummaries;
    mapping(uint256 => bool) private electionResultsSaved;

    // Events give a permanent public trail of every important action.
    event ElectionPrepared(uint256 indexed electionId, string topic);
    event VoterEligibilityChanged(uint256 indexed electionId, address indexed voter, bool eligible);
    event VoterExcluded(uint256 indexed electionId, address indexed voter);
    event VoterReinstated(uint256 indexed electionId, address indexed voter);
    event VoteCommitted(uint256 indexed electionId, address indexed voter, bytes32 commitment);
    event RevealStarted(uint256 indexed electionId);
    event VoteRevealed(uint256 indexed electionId, address indexed voter);
    event ResultsFinalized(uint256 indexed electionId, bytes32 resultHash);
    event ElectionReset(uint256 indexed electionId);

    // ---------- Access control ----------
    // The checks live in internal functions so their code exists once, not in every function.

    function _onlyAdmin() internal view {
        require(msg.sender == admin, "Admin only");
    }

    function _inPhase(Phase expected) internal view {
        require(phase == expected, "Action not allowed in this phase");
    }

    /// @dev Only the Admin account may call the function.
    modifier onlyAdmin() {
        _onlyAdmin();
        _;
    }

    /// @dev The function only works in one specific phase.
    modifier inPhase(Phase expected) {
        _inPhase(expected);
        _;
    }

    constructor() {
        admin = msg.sender;
        phase = Phase.Setup;
    }

    // --------------------------------------------------
    // ELECTION MANAGEMENT (Admin)
    // --------------------------------------------------

    /// @notice Start a new election. Only allowed when no election is active
    ///         (Setup or Finalized), so a running election can never be overwritten.
    function prepareVotingRound(
        string calldata topic,
        string[] calldata votingOptions
    ) external onlyAdmin {
        require(
            phase == Phase.Setup || phase == Phase.Finalized,
            "Current election is not finished"
        );
        require(bytes(topic).length > 0, "Topic cannot be empty");
        require(votingOptions.length >= 2, "At least two options required");
        require(votingOptions.length <= 20, "Maximum 20 options");

        for (uint256 i = 0; i < votingOptions.length; i++) {
            require(bytes(votingOptions[i]).length > 0, "Option cannot be empty");
        }

        // Safe: results of the previous election were copied to saved* mappings at finalisation.
        _clearOptions();

        electionId++;
        votingTopic = topic;

        for (uint256 i = 0; i < votingOptions.length; i++) {
            options.push(VotingOption({optionText: votingOptions[i], voteCount: 0}));
        }

        phase = Phase.Commit;
        emit ElectionPrepared(electionId, topic);
    }

    /// @notice Admin closes the Commit phase and opens the Reveal phase.
    function endVoting() external onlyAdmin inPhase(Phase.Commit) {
        phase = Phase.Reveal;
        emit RevealStarted(electionId);
    }

    /// @notice Admin clears the finished election and returns to Setup.
    /// Saved results and audit data for past elections stay on-chain.
    function resetVotingRound() external onlyAdmin inPhase(Phase.Finalized) {
        _clearOptions();
        delete votingTopic;

        phase = Phase.Setup;
        emit ElectionReset(electionId);
    }

    /// @dev Empty the current option list (shared by start and reset).
    function _clearOptions() internal {
        while (options.length > 0) {
            options.pop();
        }
    }

    /// @notice Names of the current election's options (public information).
    function getOptionList() external view returns (string[] memory names) {
        names = new string[](options.length);
        for (uint256 i = 0; i < options.length; i++) {
            names[i] = options[i].optionText;
        }
    }

    /// @notice Human-readable phase name for the frontend.
    function getVotingStatus() external view returns (string memory) {
        if (phase == Phase.Setup) return "Setup";
        if (phase == Phase.Commit) return "Commit Phase";
        if (phase == Phase.Reveal) return "Reveal Phase";
        return "Results Finalized";
    }

    // --------------------------------------------------
    // VOTER ELIGIBILITY (Admin, Commit phase only)
    // --------------------------------------------------

    /// @notice Add a voter to the current election's whitelist.
    function addEligibleVoter(address voter)
        external
        onlyAdmin
        inPhase(Phase.Commit)
    {
        require(voter != address(0), "Invalid address");
        require(voter != admin, "Admin cannot be eligible");
        require(!eligibleVoters[electionId][voter], "Already eligible");
        require(!excludedVoters[electionId][voter], "Voter is excluded");

        eligibleVoters[electionId][voter] = true;
        eligibleVoterList[electionId].push(voter);

        emit VoterEligibilityChanged(electionId, voter, true);
    }

    /// @notice Remove a voter from the whitelist (not possible after they committed).
    function removeEligibleVoter(address voter)
        external
        onlyAdmin
        inPhase(Phase.Commit)
    {
        require(eligibleVoters[electionId][voter], "Voter is not eligible");
        require(!hasCommitted[electionId][voter], "Voter already committed");

        eligibleVoters[electionId][voter] = false;
        _removeAddress(eligibleVoterList[electionId], voter);

        emit VoterEligibilityChanged(electionId, voter, false);
    }

    /// @notice True only if the voter is whitelisted and not excluded.
    function isEligible(address voter) external view returns (bool) {
        return eligibleVoters[electionId][voter] && !excludedVoters[electionId][voter];
    }

    function getEligibleVoters()
        external
        view
        onlyAdmin
        returns (address[] memory)
    {
        return eligibleVoterList[electionId];
    }

    // --------------------------------------------------
    // OPTIONAL EXCLUSION CONTROLS (Admin, Commit phase only)
    // --------------------------------------------------

    /// @notice Block a voter from this election (cannot be done after they committed).
    function excludeVoter(address voter)
        external
        onlyAdmin
        inPhase(Phase.Commit)
    {
        require(voter != address(0), "Invalid address");
        require(voter != admin, "Invalid voter address");
        require(!excludedVoters[electionId][voter], "Already excluded");
        require(!hasCommitted[electionId][voter], "Voter already committed");

        excludedVoters[electionId][voter] = true;
        excludedList[electionId].push(voter);

        emit VoterExcluded(electionId, voter);
    }

    /// @notice Remove an exclusion. Does NOT add the voter to the whitelist.
    function reinstateVoter(address voter)
        external
        onlyAdmin
        inPhase(Phase.Commit)
    {
        require(excludedVoters[electionId][voter], "Voter is not excluded");

        excludedVoters[electionId][voter] = false;
        _removeAddress(excludedList[electionId], voter);

        emit VoterReinstated(electionId, voter);
    }

    function isExcluded(address voter) external view returns (bool) {
        return excludedVoters[electionId][voter];
    }

    function getExcludedVoters()
        external
        view
        onlyAdmin
        returns (address[] memory)
    {
        return excludedList[electionId];
    }

    /// @dev Remove an address from a list by swapping with the last element.
    function _removeAddress(address[] storage list, address target) internal {
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == target) {
                list[i] = list[list.length - 1];
                list.pop();
                break;
            }
        }
    }

    // --------------------------------------------------
    // COMMIT PHASE (voters)
    // --------------------------------------------------

    /// @notice Submit a secret commitment instead of a plain vote.
    ///         commitment = keccak256(abi.encode(electionId, voter, optionIndex, salt)).
    ///         Binding it to electionId and the voter's address stops anyone copying
    ///         another voter's commitment or replaying one across elections.
    function submitCommitment(bytes32 commitment)
        external
        inPhase(Phase.Commit)
    {
        require(msg.sender != admin, "Admin cannot vote");
        require(eligibleVoters[electionId][msg.sender], "You are not eligible to vote");
        require(!excludedVoters[electionId][msg.sender], "You are excluded");
        require(!hasCommitted[electionId][msg.sender], "You have already voted"); // one vote only
        require(commitment != bytes32(0), "Commitment cannot be empty");

        hasCommitted[electionId][msg.sender] = true;
        commitments[electionId][msg.sender] = commitment;
        committedVoters[electionId].push(msg.sender);

        emit VoteCommitted(electionId, msg.sender, commitment);
    }

    // --------------------------------------------------
    // REVEAL PHASE (voters) - validation and counting
    // --------------------------------------------------

    /// @notice Open your commitment. The vote is counted only if the recomputed hash
    ///         matches the stored commitment, so changed or forged votes are rejected.
    function revealVote(uint256 optionIndex, bytes32 salt)
        external
        inPhase(Phase.Reveal)
    {
        require(msg.sender != admin, "Admin cannot vote");
        require(hasCommitted[electionId][msg.sender], "No commitment found");
        require(!hasRevealed[electionId][msg.sender], "Already revealed");
        require(optionIndex < options.length, "Invalid option");

        bytes32 expectedCommitment = keccak256(
            abi.encode(electionId, msg.sender, optionIndex, salt)
        );
        require(
            expectedCommitment == commitments[electionId][msg.sender],
            "Choice or salt does not match"
        );

        hasRevealed[electionId][msg.sender] = true;
        revealedChoices[electionId][msg.sender] = optionIndex;
        options[optionIndex].voteCount++;

        emit VoteRevealed(electionId, msg.sender);
    }

    // --------------------------------------------------
    // FINALISE AND PUBLISH RESULTS (Admin)
    // --------------------------------------------------

    /// @notice Publish results, the audit list and a result hash on-chain.
    ///         Voters who did not reveal are recorded as "not revealed" and not counted.
    function finaliseResults()
        external
        onlyAdmin
        inPhase(Phase.Reveal)
    {
        uint256 id = electionId;

        uint256 revealedCount = _publishAudit(id);
        uint256 countedVotes = _saveResults(id);

        // Consistency rule: every counted vote must come from a valid reveal.
        require(countedVotes == revealedCount, "Tally mismatch");

        bytes32 resultHash = _resultHash(id);

        electionSummaries[id] = ElectionSummary({
            committedCount: committedVoters[id].length,
            revealedCount: revealedCount,
            countedVotes: countedVotes,
            resultHash: resultHash
        });

        electionResultsSaved[id] = true;
        phase = Phase.Finalized;

        emit ResultsFinalized(id, resultHash);
    }

    /// @dev One audit record per committed voter (no choice, no salt).
    function _publishAudit(uint256 id) internal returns (uint256 revealedCount) {
        address[] storage voters = committedVoters[id];

        for (uint256 i = 0; i < voters.length; i++) {
            address voter = voters[i];
            bool revealed = hasRevealed[id][voter];

            if (revealed) revealedCount++;

            electionAudit[id].push(
                AuditRecord({voter: voter, commitment: commitments[id][voter], revealed: revealed})
            );
        }
    }

    /// @dev Copy final names, counts and winners into permanent storage.
    ///      The saved* slots of this election id are always empty before this runs,
    ///      because an election is finalised only once.
    function _saveResults(uint256 id) internal returns (uint256 totalCounted) {
        uint256 maxVotes = 0;

        for (uint256 i = 0; i < options.length; i++) {
            savedOptionNames[id].push(options[i].optionText);
            savedVoteCounts[id].push(options[i].voteCount);
            totalCounted += options[i].voteCount;

            if (options[i].voteCount > maxVotes) {
                maxVotes = options[i].voteCount;
            }
        }

        // A tie publishes every option with the highest count.
        // If nobody revealed, the winner list stays empty.
        if (maxVotes > 0) {
            for (uint256 i = 0; i < options.length; i++) {
                if (options[i].voteCount == maxVotes) {
                    savedWinners[id].push(options[i].optionText);
                }
            }
        }
    }

    /// @dev Hash of the saved result; anyone can recompute it from the public data.
    function _resultHash(uint256 id) internal view returns (bytes32) {
        string[] storage s = savedOptionNames[id];
        uint256[] storage c = savedVoteCounts[id];

        string[] memory names = new string[](s.length);
        uint256[] memory counts = new uint256[](c.length);

        for (uint256 i = 0; i < s.length; i++) {
            names[i] = s[i];
            counts[i] = c[i];
        }

        return keccak256(abi.encode(id, names, counts));
    }

    // --------------------------------------------------
    // RESULTS AND VERIFICATION (public, after finalisation)
    // --------------------------------------------------

    /// @dev Results and audit exist only for finalised elections.
    function _requireSaved(uint256 id) internal view {
        require(electionResultsSaved[id], "Results not saved");
    }

    /// @notice Winner(s) of the current election (only after finalisation).
    function getWinner()
        external
        view
        inPhase(Phase.Finalized)
        returns (string[] memory)
    {
        return savedWinners[electionId];
    }

    /// @notice Option names and counts of the current election (only after finalisation).
    function getResults()
        external
        view
        inPhase(Phase.Finalized)
        returns (string[] memory names, uint256[] memory counts)
    {
        return (savedOptionNames[electionId], savedVoteCounts[electionId]);
    }

    /// @notice Saved results of any finalised election.
    function getElectionResults(uint256 pastElectionId)
        external
        view
        returns (
            string[] memory names,
            uint256[] memory counts,
            string[] memory winners
        )
    {
        _requireSaved(pastElectionId);

        return (
            savedOptionNames[pastElectionId],
            savedVoteCounts[pastElectionId],
            savedWinners[pastElectionId]
        );
    }

    /// @notice Audit list: voter, commitment and whether the reveal was valid.
    ///         Individual choices and salts are intentionally NOT stored here.
    function getElectionAudit(uint256 pastElectionId)
        external
        view
        returns (AuditRecord[] memory)
    {
        _requireSaved(pastElectionId);

        return electionAudit[pastElectionId];
    }

    /// @notice Totals and result hash recorded at finalisation.
    function getElectionSummary(uint256 pastElectionId)
        external
        view
        returns (
            uint256 committedCount,
            uint256 revealedCount,
            uint256 countedVotes,
            bytes32 resultHash
        )
    {
        _requireSaved(pastElectionId);

        ElectionSummary storage s = electionSummaries[pastElectionId];
        return (s.committedCount, s.revealedCount, s.countedVotes, s.resultHash);
    }

    /// @notice On-chain consistency check of a published result. It confirms that:
    ///         1) the audit list has one record per committed voter,
    ///         2) the number of valid reveals in the audit matches the summary,
    ///         3) the sum of option counts equals the number of valid reveals,
    ///         4) the stored result hash matches the stored names and counts.
    function verifyElectionResult(uint256 pastElectionId)
        external
        view
        returns (bool)
    {
        _requireSaved(pastElectionId);

        ElectionSummary storage s = electionSummaries[pastElectionId];
        AuditRecord[] storage audit = electionAudit[pastElectionId];

        uint256 revealedInAudit = 0;
        for (uint256 i = 0; i < audit.length; i++) {
            if (audit[i].revealed) revealedInAudit++;
        }

        return
            audit.length == s.committedCount &&
            revealedInAudit == s.revealedCount &&
            s.countedVotes == s.revealedCount &&
            _resultHash(pastElectionId) == s.resultHash;
    }

    // --------------------------------------------------
    // INDIVIDUAL VOTER STATUS
    // --------------------------------------------------

    /// @notice Whether the caller has committed and revealed in the current election.
    function getMyVotingStatus()
        external
        view
        returns (bool committed, bool revealed)
    {
        return (
            hasCommitted[electionId][msg.sender],
            hasRevealed[electionId][msg.sender]
        );
    }

    /// @notice The caller's own revealed choice.
    /// @dev Convenience only, not a privacy guarantee: eth_call lets anyone set `from`,
    ///      and the reveal transaction's calldata is public anyway.
    function viewMyVote() external view returns (string memory) {
        require(hasRevealed[electionId][msg.sender], "You have not revealed your vote");

        uint256 choice = revealedChoices[electionId][msg.sender];

        // After finalisation or reset, `options` may be cleared, so use the saved names.
        if (electionResultsSaved[electionId]) {
            return savedOptionNames[electionId][choice];
        }

        return options[choice].optionText;
    }
}