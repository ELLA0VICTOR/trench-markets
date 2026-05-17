// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Trench Signal Registry
/// @notice Stores immutable report hashes and market signal metadata for Trench agents.
contract SignalRegistry {
    enum Signal {
        BuyYes,
        BuyNo,
        Pass
    }

    struct SignalRecord {
        address publisher;
        bytes32 reportHash;
        string marketId;
        Signal signal;
        uint16 marketBps;
        uint16 fairBps;
        uint16 confidenceBps;
        int16 edgeBps;
        string artifactUri;
        uint64 publishedAt;
    }

    mapping(bytes32 proofId => SignalRecord record) public records;
    bytes32[] public proofIds;

    event SignalPublished(
        bytes32 indexed proofId,
        bytes32 indexed reportHash,
        address indexed publisher,
        string marketId,
        Signal signal,
        uint16 marketBps,
        uint16 fairBps,
        uint16 confidenceBps,
        int16 edgeBps,
        string artifactUri
    );

    error InvalidReportHash();
    error InvalidMarketId();
    error InvalidBps();
    error ProofAlreadyExists();

    function publishSignal(
        bytes32 reportHash,
        string calldata marketId,
        Signal signal,
        uint16 marketBps,
        uint16 fairBps,
        uint16 confidenceBps,
        int16 edgeBps,
        string calldata artifactUri
    ) external returns (bytes32 proofId) {
        if (reportHash == bytes32(0)) revert InvalidReportHash();
        if (bytes(marketId).length == 0) revert InvalidMarketId();
        if (marketBps > 10_000 || fairBps > 10_000 || confidenceBps > 10_000) {
            revert InvalidBps();
        }

        proofId = keccak256(
            abi.encodePacked(block.chainid, address(this), msg.sender, reportHash, marketId)
        );

        if (records[proofId].publishedAt != 0) revert ProofAlreadyExists();

        records[proofId] = SignalRecord({
            publisher: msg.sender,
            reportHash: reportHash,
            marketId: marketId,
            signal: signal,
            marketBps: marketBps,
            fairBps: fairBps,
            confidenceBps: confidenceBps,
            edgeBps: edgeBps,
            artifactUri: artifactUri,
            publishedAt: uint64(block.timestamp)
        });

        proofIds.push(proofId);

        emit SignalPublished(
            proofId,
            reportHash,
            msg.sender,
            marketId,
            signal,
            marketBps,
            fairBps,
            confidenceBps,
            edgeBps,
            artifactUri
        );
    }

    function proofCount() external view returns (uint256) {
        return proofIds.length;
    }
}
