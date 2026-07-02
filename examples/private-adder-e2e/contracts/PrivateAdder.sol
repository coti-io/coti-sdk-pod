// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import "@coti-io/coti-contracts/contracts/pod/mpc/PodLib.sol";
import "@coti-io/coti-contracts/contracts/pod/mpc/PodUserSepolia.sol";
import "@coti-io/coti-contracts/contracts/pod/PodNetworkConstants.sol";

/// @title PrivateAdder
/// @notice Adds two encrypted uint64 values via PoD on Sepolia (SDK preset addresses).
contract PrivateAdder is PodLib, PodUserSepolia {
    /// @dev MPC executor wired to the CREATE3 inbox on COTI testnet (PodNetworkConstants value is stale for add64).
    address private constant COTI_TESTNET_MPC_EXECUTOR_V2 =
        0x68E151b78D51cEA01EEF6ee354579E044606A739;

    enum RequestStatus {
        None,
        Pending,
        Completed
    }

    mapping(bytes32 => ctUint64) public sumByRequest;
    mapping(bytes32 => RequestStatus) public statusByRequest;

    event AddRequested(bytes32 indexed requestId, address indexed caller);
    event AddCompleted(bytes32 indexed requestId);

    constructor() PodLibBase(msg.sender) {
        configureCoti(
            COTI_TESTNET_MPC_EXECUTOR_V2,
            PodNetworkConstants.COTI_TESTNET_CHAIN_ID
        );
    }

    function add(
        itUint64 calldata a,
        itUint64 calldata b,
        uint256 callbackFeeLocalWei
    ) external payable returns (bytes32 requestId) {
        requestId = add64(
            a,
            b,
            msg.sender,
            this.addCallback.selector,
            this.onDefaultMpcError.selector,
            msg.value,
            callbackFeeLocalWei
        );
        statusByRequest[requestId] = RequestStatus.Pending;
        emit AddRequested(requestId, msg.sender);
    }

    function addCallback(bytes memory data) external onlyInbox {
        bytes32 requestId = inbox.inboxSourceRequestId();
        if (requestId == bytes32(0)) {
            requestId = inbox.inboxRequestId();
        }

        ctUint64 sum = abi.decode(data, (ctUint64));
        sumByRequest[requestId] = sum;
        statusByRequest[requestId] = RequestStatus.Completed;
        emit AddCompleted(requestId);
    }
}
