# Conversion Playbook

## Purpose

Use this playbook to convert synchronous non-private Solidity logic into PoD asynchronous privacy flows.

## Architecture Decision

Choose one pattern per operation:

1. Library-backed pattern:
   - Use when operation is available in shared executor (`PodLib` methods such as `add64`, `gt64`, `add128`, `add256`, and related ops).
   - Implement only EVM-side request + callback contract.

2. Custom COTI pattern:
   - Use when operation is not available in shared executor.
   - Implement EVM request contract + COTI privacy contract.

## Migration Checklist

1. Identify sensitive inputs, state, and outputs in legacy contract.
2. Replace sensitive function inputs with `it*`.
3. Move sensitive math/logic from EVM sync path to COTI private path (`gt*`).
4. Add explicit fee path:
   - Estimate two-way requirement with `calculateTwoWayFeeRequiredInLocalToken(...)`.
   - Decide `msg.value` (total) and `callbackFeeLocalWei` (callback slice).
5. Replace direct returns with:
   - Request submission
   - Request ID tracking
   - Callback fulfillment
6. Persist returned `ct*` outputs for user retrieval.
7. Add callback and error handlers restricted by `onlyInbox`.
8. Emit request/result events for observability.
9. Update tests to assert eventual callback state instead of immediate return.

## Async State Machine Template

Use this template in EVM-side contracts:

```solidity
mapping(bytes32 => address) private _requestOwner;
mapping(bytes32 => ctUint64) private _resultByRequest;

event PrivateOpRequested(bytes32 indexed requestId, address indexed requester);
event PrivateOpCompleted(bytes32 indexed requestId);

function privateOp(
    itUint64 calldata a,
    itUint64 calldata b,
    uint256 callbackFeeLocalWei
) external payable {
    bytes32 requestId = /* call PodLib.* helper or inbox.sendTwoWayMessage(..., callbackFeeLocalWei) */;
    _requestOwner[requestId] = msg.sender;
    emit PrivateOpRequested(requestId, msg.sender);
}

function privateOpCallback(bytes calldata data) external onlyInbox {
    bytes32 requestId = inbox.inboxSourceRequestId();
    if (requestId == bytes32(0)) {
        requestId = inbox.inboxRequestId();
    }
    ctUint64 result = abi.decode(data, (ctUint64));
    _resultByRequest[requestId] = result;
    emit PrivateOpCompleted(requestId);
}
```

## Custom COTI Contract Template

Use this shape for COTI privacy logic:

```solidity
function executePrivate(/* args */) external onlyInbox {
    // 1) Convert user ciphertext/input to private compute domain
    // gtUint64 x = MpcCore.onBoard(ctX);
    // 2) Execute private logic
    // gtUint64 y = MpcCore.add(x, z);
    // 3) Convert to user ciphertext response
    // ctUint64 out = MpcCore.offBoardToUser(y, user);
    // 4) Respond with ABI-aligned payload
    inbox.respond(abi.encode(out));
}
```

## Example Mapping In This Repository

- Minimal library-backed RPC:
  - EVM: `contracts/examples/it128/PodAdder128.sol`
  - EVM: `contracts/examples/it256/PodAdder256.sol`
- Comparison flow with request tracking:
  - EVM: `contracts/examples/millionaire/Millionaire.sol`
- Split EVM/COTI custom logic:
  - EVM: `contracts/examples/perc20/PErc20.sol`
  - COTI: `contracts/examples/perc20/PErc20Coti.sol`
- Shared library internals:
  - `contracts/mpc/PodLib.sol`
  - `contracts/mpc/PodLibBase.sol`
  - `contracts/mpc/PodLib64.sol`
  - `contracts/mpc/PodLib128.sol`
  - `contracts/mpc/PodLib256.sol`

## Review Criteria

- Verify no synchronous assumption remains for private operations.
- Verify all sensitive values leave plaintext storage paths.
- Verify error path is observable (`onDefaultMpcError` or custom handler).
- Verify callback payload schema is explicit and versionable.
- Verify fee assumptions are explicit (gas price, `msg.value`, callback slice).
