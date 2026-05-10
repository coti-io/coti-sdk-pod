# Getting started

## Prerequisites

- Node.js 18+ (for modern runtime compatibility including `fetch`).
- Solidity toolchain (Foundry or Hardhat).
- An Inbox deployment on your EVM chain and connectivity to COTI execution.

## Install

```bash
npm install @coti/pod-sdk
```

## Imports

```solidity
import "@coti/pod-sdk/contracts/IInbox.sol";
import "@coti/pod-sdk/contracts/mpc/PodLib.sol";
import "@coti/pod-sdk/contracts/mpc/PodLibBase.sol";
import "@coti/pod-sdk/contracts/mpccodec/MpcAbiCodec.sol";
import "@coti/pod-sdk/contracts/utils/mpc/MpcCore.sol";
```

```typescript
import { CotiPodCrypto, DataType } from "@coti/pod-sdk";
```

## Network-specific routing (`PodUserSepolia` and `PodLib`)

The SDK ships **per-network preset mixins** (for example `/contracts/mpc/PodUserSepolia.sol`) that hold the canonical **inbox address**, **COTI chain id**, and **MPC executor address** for that environment.

`PodLib` already pulls in `PodUser` / `PodLibBase`. To use library helpers **and** wired defaults for a known network, inherit **both** in this order:

```text
contract MyApp is PodLib, PodUserSepolia
```

In the constructor, call `PodLibBase(msg.sender)` (or another owner address), then apply the mixin constants with the internal `PodUser` hooks:

```solidity
import "@coti/pod-sdk/contracts/mpc/PodLib.sol";
import "@coti/pod-sdk/contracts/mpc/PodLibBase.sol";
import "@coti/pod-sdk/contracts/mpc/PodUserSepolia.sol";

contract MyApp is PodLib, PodUserSepolia {
    constructor() PodLibBase(msg.sender) {
        setInbox(INBOX_ADDRESS);
        configureCoti(MPC_EXECUTOR_ADDRESS, COTI_CHAIN_ID);
    }
}
```

Other networks can follow the same pattern with additional preset contracts as they are added to the SDK. If you deploy on a chain without a preset, keep the manual `setInbox` / `configureCoti` or `configure(...)` flow from `PodUser`.

## Minimal contract with safe configuration pattern

`PodUser.configure(...)` is **`onlyOwner`** and is the supported way to change inbox and COTI routing after deploy.

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import "@coti/pod-sdk/contracts/mpc/PodLib.sol";
import "@coti/pod-sdk/contracts/mpc/PodUserSepolia.sol";
import "@coti/pod-sdk/contracts/utils/mpc/MpcCore.sol";

contract PrivateCompare is PodLib, PodUserSepolia {
    address public owner;

    mapping(bytes32 => ctBool) public resultByRequest;

    event CompareRequested(bytes32 indexed requestId, address indexed caller);
    event CompareCompleted(bytes32 indexed requestId, ctBool result);

    /// @param callbackFeeLocalWei Portion of `msg.value` reserved for the callback leg; see /docs/contracts/04-fees-gas-and-oracle.md
    function compare(
        itUint64 calldata a,
        itUint64 calldata b,
        uint256 callbackFeeLocalWei
    ) external payable {
        bytes32 requestId = gt64(
            a,
            b,
            msg.sender,
            this.compareCallback.selector,
            this.onDefaultMpcError.selector,
            msg.value,
            callbackFeeLocalWei
        );

        emit CompareRequested(requestId, msg.sender);
    }

    function compareCallback(bytes memory data) external onlyInbox {
        bytes32 requestId = inbox.inboxSourceRequestId();
        if (requestId == bytes32(0)) {
            requestId = inbox.inboxRequestId();
        }

        ctBool result = abi.decode(data, (ctBool));
        resultByRequest[requestId] = result;
        emit CompareCompleted(requestId, result);
    }
}
```

## Minimal frontend flow

```typescript
import { CotiPodCrypto, DataType } from "@coti/pod-sdk";

const encA = await CotiPodCrypto.encrypt("10", "testnet", DataType.Uint64);
const encB = await CotiPodCrypto.encrypt("20", "testnet", DataType.Uint64);

// await contract.compare(encA, encB)
// later read ctBool and decrypt with user's AES key:
const plain = CotiPodCrypto.decrypt("0x...", accountAesKey, DataType.Bool);
```

## First production checklist

- Gate all admin config functions (`configure` / inbox updates, upgrade hooks, etc.).
- Ensure every callback and error handler is `onlyInbox`.
- Persist request IDs for correlation and troubleshooting.
- Keep callback decode tuple exactly aligned to COTI response tuple.
- Budget **`msg.value`** and **`callbackFeeLocalWei`** for two-way sends (estimate via `calculateTwoWayFeeRequiredInLocalToken` on the Inbox; see `/docs/contracts/04-fees-gas-and-oracle.md`).
- Keep account AES key out of logs and analytics.
