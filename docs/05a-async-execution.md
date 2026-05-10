# Async execution

PoD private operations are request/response workflows. Treat them as state machines.

## Canonical lifecycle

1. User sends tx with `it*` input (and, for payable flows, native fee via `msg.value`).
2. EVM submits Inbox request (`sendTwoWayMessage{value: ...}(..., callbackFeeLocalWei)` or a `PodLib` helper that forwards the same).
3. COTI executes private logic.
4. COTI returns ABI payload with `inbox.respond(...)`.
5. Inbox calls EVM callback.
6. EVM decodes payload, stores `ct*` result, emits completion event.

## Request ID handling pattern

Persist request IDs at submission. In callback, resolve with this order:

1. `inbox.inboxSourceRequestId()`
2. if zero, `inbox.inboxRequestId()`

This pattern is used in `/contracts/examples/millionaire/Millionaire.sol`.

## Recommended status model

```solidity
enum RequestStatus { NONE, PENDING, COMPLETED, FAILED }
```

Track status transitions:

- `NONE -> PENDING` on submission,
- `PENDING -> COMPLETED` on callback success,
- `PENDING -> FAILED` on error callback.

## Callback template

```solidity
function callback(bytes memory data) external onlyInbox {
    // Validate that the remote contract is trusted:
    (uint remote_chain_id, address remote_sender) = inbox.inboxMsgSender();
    require(remote_chain_id == EXPECTER_REMOTE_CHAIN && remote_sender == EXPECTED_PEER_CONTRACT,
        "not allowed");
    bytes32 requestId = inbox.inboxSourceRequestId();

    // Must match COTI-side abi.encode layout exactly.
    ctUint64 result = abi.decode(data, (ctUint64));
    resultByRequest[requestId] = result;
    status[requestId] = RequestStatus.COMPLETED;
}
```

## Error callback template

```solidity
function onError(bytes32 requestId) external onlyInbox {
    // Validate that the remote contract is trusted:
    (uint remote_chain_id, address remote_sender) = inbox.inboxMsgSender();
    require(remote_chain_id == EXPECTER_REMOTE_CHAIN && remote_sender == EXPECTED_PEER_CONTRACT,
        "not allowed");

    (uint256 code, string memory message) = inbox.getOutboxError(requestId);
    status[requestId] = RequestStatus.FAILED;
    emit RequestFailed(requestId, code, message);
}
```

## Common async mistakes

- expecting same-tx completion for private operations,
- not storing request correlation state,
- decoding callback payload with wrong tuple,
- missing `onlyInbox` on callback/error selectors,
- mutating business state without validating request context.
