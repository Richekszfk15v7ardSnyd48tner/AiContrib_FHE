// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract AiContribFHE is SepoliaConfig {
    struct EncryptedModelUpdate {
        uint256 id;
        euint32 encryptedWeights;
        euint32 encryptedMetrics;
        uint256 timestamp;
    }

    struct DecryptedContribution {
        uint256 participantId;
        uint32 shapleyValue;
        bool isRevealed;
    }

    uint256 public updateCount;
    mapping(uint256 => EncryptedModelUpdate) public encryptedUpdates;
    mapping(uint256 => DecryptedContribution) public decryptedContributions;

    mapping(uint256 => euint32) private encryptedContributionTotals;
    uint256[] private participantList;

    mapping(uint256 => uint256) private requestToUpdateId;

    event UpdateSubmitted(uint256 indexed id, uint256 timestamp);
    event DecryptionRequested(uint256 indexed id);
    event ContributionDecrypted(uint256 indexed id);

    modifier onlyParticipant(uint256 participantId) {
        _;
    }

    /// @notice Submit a new encrypted model update
    function submitEncryptedUpdate(
        euint32 encryptedWeights,
        euint32 encryptedMetrics
    ) public {
        updateCount += 1;
        uint256 newId = updateCount;

        encryptedUpdates[newId] = EncryptedModelUpdate({
            id: newId,
            encryptedWeights: encryptedWeights,
            encryptedMetrics: encryptedMetrics,
            timestamp: block.timestamp
        });

        decryptedContributions[newId] = DecryptedContribution({
            participantId: newId,
            shapleyValue: 0,
            isRevealed: false
        });

        emit UpdateSubmitted(newId, block.timestamp);
    }

    /// @notice Request decryption of a model update
    function requestUpdateDecryption(uint256 updateId) public onlyParticipant(updateId) {
        EncryptedModelUpdate storage update = encryptedUpdates[updateId];
        require(!decryptedContributions[updateId].isRevealed, "Already decrypted");

        bytes32[] memory ciphertexts = new bytes32[](2);
        ciphertexts[0] = FHE.toBytes32(update.encryptedWeights);
        ciphertexts[1] = FHE.toBytes32(update.encryptedMetrics);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptContribution.selector);
        requestToUpdateId[reqId] = updateId;

        emit DecryptionRequested(updateId);
    }

    /// @notice Callback for decrypted contribution data
    function decryptContribution(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 updateId = requestToUpdateId[requestId];
        require(updateId != 0, "Invalid request");

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32[] memory results = abi.decode(cleartexts, (uint32[]));

        DecryptedContribution storage contribution = decryptedContributions[updateId];
        contribution.shapleyValue = results[0];
        contribution.isRevealed = true;

        if (FHE.isInitialized(encryptedContributionTotals[updateId]) == false) {
            encryptedContributionTotals[updateId] = FHE.asEuint32(0);
            participantList.push(updateId);
        }

        encryptedContributionTotals[updateId] = FHE.add(
            encryptedContributionTotals[updateId],
            FHE.asEuint32(results[0])
        );

        emit ContributionDecrypted(updateId);
    }

    /// @notice Get decrypted contribution details
    function getDecryptedContribution(uint256 updateId) public view returns (
        uint256 participantId,
        uint32 shapleyValue,
        bool isRevealed
    ) {
        DecryptedContribution storage c = decryptedContributions[updateId];
        return (c.participantId, c.shapleyValue, c.isRevealed);
    }

    /// @notice Get encrypted total contribution
    function getEncryptedContributionTotal(uint256 updateId) public view returns (euint32) {
        return encryptedContributionTotals[updateId];
    }

    /// @notice Request total contribution decryption
    function requestContributionTotalDecryption(uint256 updateId) public {
        euint32 total = encryptedContributionTotals[updateId];
        require(FHE.isInitialized(total), "Update not found");

        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(total);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptTotalContribution.selector);
        requestToUpdateId[reqId] = updateId;
    }

    /// @notice Callback for decrypted total contribution
    function decryptTotalContribution(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 updateId = requestToUpdateId[requestId];

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32 totalValue = abi.decode(cleartexts, (uint32));
        // Handle decrypted total contribution as needed
    }
}
