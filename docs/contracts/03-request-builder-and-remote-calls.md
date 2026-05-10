# Request builder and remote calls (`MpcAbiCodec`) 

This file explains how to build custom cross-domain requests and why argument typing must be precise.

Primary source:

- `/contracts/mpccodec/MpcAbiCodec.sol`
- `/contracts/examples/perc20/PErc20.sol`
- `/contracts/examples/perc20/PErc20Coti.sol`

## Why request builder exists

`MpcAbiCodec` constructs `IInbox.MpcMethodCall` payloads with:

- target selector,
- encoded arguments,
- per-argument type metadata.

That metadata is used in the request pipeline to validate and normalize types, including private `it*` inputs.

## Critical type mapping rule

When request builder includes `it*` argument (EVM side), COTI method should usually accept corresponding `gt*`.

Example:

- EVM request argument: `itUint64 amount`
- COTI target parameter: `gtUint64 amount`

Do not mirror `it*` directly in the COTI function signature for this flow.

## pERC20 request builder example (line-by-line)

Source pattern from `/contracts/examples/perc20/PErc20.sol`:

```solidity
IInbox.MpcMethodCall memory methodCall =
    MpcAbiCodec.create(IPErc20Coti.transferFrom.selector, 3)
    .addArgument(msg.sender)
    .addArgument(to)
    .addArgument(amount)
    .build();
```

Line-by-line explanation:

1. `MpcAbiCodec.create(IPErc20Coti.transferFrom.selector, 3)`
   Initializes a request context for selector `transferFrom` with exactly 3 arguments.
2. `.addArgument(msg.sender)`
   Adds public `address` argument (`from`). Tagged as `ADDRESS` in datatype metadata.
3. `.addArgument(to)`
   Adds encrypted recipient (`itUint256`) argument. Tagged as `IT_UINT256`.
4. `.addArgument(amount)`
   Adds encrypted amount (`itUint64`) argument. Tagged as `IT_UINT64`.
5. `.build()`
   Finalizes compact payload bytes + datatype metadata into `IInbox.MpcMethodCall`.

Then request is sent (payable: total fee is `msg.value`; callback slice is explicit):

```solidity
IInbox(inbox).sendTwoWayMessage{value: msg.value}(
    cotiChainId,
    mpcExecutorAddress,
    methodCall,
    PErc20.updateBalanceCallback.selector,
    PodLibBase.onDefaultMpcError.selector,
    callbackFeeLocalWei
);
```

Explanation:

1. `{value: msg.value}`
   Total native token budget for this two-way message (see [Fees, gas, and oracle](04-fees-gas-and-oracle.md)).
2. `cotiChainId`
   Target chain ID for execution route.
3. `mpcExecutorAddress`
   Target remote contract/executor address.
4. `methodCall`
   Built payload with selector + encoded args + datatype metadata.
5. `updateBalanceCallback.selector`
   Callback for success response bytes.
6. `onDefaultMpcError.selector`
   Callback for failure path (`PodLibBase` default handler in library-based apps).
7. `callbackFeeLocalWei`
   Portion of `msg.value` reserved for the return leg; must be greater than zero and not greater than `msg.value`.

## Matching COTI signature (important)

In `/contracts/examples/perc20/PErc20Coti.sol`, target method is:

```solidity
function transferFrom(address from, gtUint256 calldata to, gtUint64 amount) external onlyInbox
```

Why `gt*`:

- request pipeline normalizes `it*` to compute-domain arguments before calling COTI target.
- COTI function should be written for compute-domain types it will actually receive.

## Callback tuple alignment example

COTI response:

```solidity
inbox.respond(abi.encode(fromHash, fromBalanceResponse, toHash, toBalanceResponse));
```

EVM callback decode must match exactly:

```solidity
(bytes32 fromHash, ctUint64 fromBalanceResponse, bytes32 toHash, ctUint64 toBalanceResponse) =
    abi.decode(data, (bytes32, ctUint64, bytes32, ctUint64));
```

If field order or types differ, decode will fail or produce corrupted state.

## Checklist for custom request builders

- Selector points to correct COTI function.
- `argCount` matches number of `.addArgument(...)` calls.
- Argument order matches target function parameter order exactly.
- EVM private inputs use `it*`; COTI parameters use corresponding `gt*`.
- Callback decode tuple matches COTI `abi.encode(...)` tuple exactly.
- Payable entrypoints set `msg.value` and `callbackFeeLocalWei` using inbox fee estimates and adequate buffer ([Fees, gas, and oracle](04-fees-gas-and-oracle.md)).
