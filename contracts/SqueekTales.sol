// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface ISqueekCore {
    struct Configuration {
        bytes32 streamId;
        uint64 genesisTimestamp;
        uint64 roundDuration;
        uint64 maxWorkPerRound;
        uint16 maxRoundsPerBatch;
        address guardian;
        address reporter;
        uint32 initialWorkPerThousandBlocks;
        uint64 targetBlocksPerActiveRound;
        uint64 difficultySmoothingRounds;
        uint96 blockUnitsPerBlock;
    }
    struct State {
        uint64 settledThroughRound;
        uint64 cumulativeWork;
        uint96 cumulativeBlockUnits;
        uint64 blockHeight;
        uint96 blockProgress;
        uint32 workPerThousandBlocks;
        uint256 authorizationNonce;
        bool paused;
    }
    function configuration() external view returns (Configuration memory);
    function state() external view returns (State memory);
    function implementationCodeVersion() external view returns (uint64);
}

/// @notice One ballot per wallet per measurement round. No privileged reward allocator.
/// @dev UTC days are timestamp / 1 days. Ties retain earliest time reaching the score.
///      Sybil resistance is per wallet only. Testnet ETH has no promised monetary value.
contract SqueekTales {
    ISqueekCore public immutable core;
    uint64 public immutable genesisTimestamp;
    uint64 public immutable roundDuration;
    uint256 public constant DAILY_POOL = 0.0055 ether;
    uint256 public constant VERSION = 2;

    struct Leader { address voter; uint32 votes; }
    mapping(uint64 => mapping(address => uint8)) public voteOf; // 0 = none; 1..3 = branch + 1
    mapping(uint64 => uint32[3]) private tallies;
    mapping(uint256 => mapping(address => uint32)) public dailyVotes;
    mapping(uint256 => address[10]) private leaders;
    mapping(uint256 => uint8) public leaderCount;
    mapping(uint256 => mapping(address => bool)) public claimed;

    error WrongChain();
    error InvalidCore();
    error InvalidBranch();
    error RoundNotOpen();
    error AlreadyVoted();
    error NotSettled();
    error DayNotClosed();
    error NotEligible();
    error AlreadyClaimed();
    error PoolUnderfunded();
    error TransferFailed();

    event Voted(address indexed voter, uint64 indexed round, uint256 indexed day, uint8 branch);
    event RewardClaimed(address indexed voter, uint256 indexed day, uint8 rank, uint256 amount);
    event Funded(address indexed sender, uint256 amount);

    constructor(address coreAddress) payable {
        if (block.chainid != 11155111) revert WrongChain();
        if (coreAddress.code.length == 0) revert InvalidCore();
        core = ISqueekCore(coreAddress);
        ISqueekCore.Configuration memory c = core.configuration();
        if (c.roundDuration != 600 || c.genesisTimestamp == 0 || core.implementationCodeVersion() != 3) revert InvalidCore();
        genesisTimestamp = c.genesisTimestamp;
        roundDuration = c.roundDuration;
        if (msg.value > 0) emit Funded(msg.sender, msg.value);
    }

    receive() external payable { emit Funded(msg.sender, msg.value); }

    function currentRound() public view returns (uint64) {
        if (block.timestamp < genesisTimestamp) return 0;
        return uint64((block.timestamp - genesisTimestamp) / roundDuration + 1);
    }

    function vote(uint64 round, uint8 branch) external {
        if (branch > 2) revert InvalidBranch();
        ISqueekCore.State memory s = core.state();
        if (round == 0 || round != currentRound() || round <= s.settledThroughRound || s.paused) revert RoundNotOpen();
        if (voteOf[round][msg.sender] != 0) revert AlreadyVoted();
        voteOf[round][msg.sender] = branch + 1;
        tallies[round][branch]++;
        uint256 day = block.timestamp / 1 days;
        uint32 score = ++dailyVotes[day][msg.sender];
        _rank(day, msg.sender, score);
        emit Voted(msg.sender, round, day, branch);
    }

    function _rank(uint256 day, address voter, uint32 score) private {
        address[10] storage board = leaders[day];
        uint8 n = leaderCount[day];
        uint8 pos = n;
        for (uint8 i; i < n; ++i) { if (board[i] == voter) { pos = i; break; } }
        if (pos == n) {
            if (n < 10) { board[n] = voter; leaderCount[day] = n + 1; }
            else {
                if (score <= dailyVotes[day][board[9]]) return;
                pos = 9;
                board[9] = voter;
            }
        }
        while (pos > 0 && score > dailyVotes[day][board[pos - 1]]) {
            board[pos] = board[pos - 1];
            --pos;
        }
        board[pos] = voter;
    }

    function roundVotes(uint64 round) external view returns (uint32[3] memory) { return tallies[round]; }

    /// @notice Settled branches only. Ties, including no votes, choose the lowest branch index.
    function winningBranch(uint64 round) external view returns (uint8 branch, uint32 total) {
        if (round == 0 || round > core.state().settledThroughRound) revert NotSettled();
        uint32[3] memory v = tallies[round];
        for (uint8 i; i < 3; ++i) { total += v[i]; if (v[i] > v[branch]) branch = i; }
    }

    function leaderboard(uint256 day) external view returns (Leader[10] memory board, uint8 count) {
        count = leaderCount[day];
        for (uint8 i; i < count; ++i) {
            address a = leaders[day][i];
            board[i] = Leader(a, dailyVotes[day][a]);
        }
    }

    /// @notice A rank is final only once its UTC day closes; rank is 1..10 or 0 if unranked.
    function rewardFor(uint256 day, address voter) public view returns (uint8 rank, uint256 amount) {
        if (voter == address(0)) return (0, 0);
        for (uint8 i; i < leaderCount[day]; ++i) {
            if (leaders[day][i] == voter) return (i + 1, (10 - uint256(i)) * 0.0001 ether);
        }
    }

    function claim(uint256 day) external {
        if (day >= block.timestamp / 1 days) revert DayNotClosed();
        if (claimed[day][msg.sender]) revert AlreadyClaimed();
        (uint8 rank, uint256 amount) = rewardFor(day, msg.sender);
        if (rank == 0) revert NotEligible();
        if (address(this).balance < amount) revert PoolUnderfunded();
        claimed[day][msg.sender] = true; // effects before interaction; rollback on failed transfer
        (bool sent,) = msg.sender.call{value: amount}("");
        if (!sent) revert TransferFailed();
        emit RewardClaimed(msg.sender, day, rank, amount);
    }
}
