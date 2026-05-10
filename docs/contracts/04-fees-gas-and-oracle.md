# Fees, gas budgets, and the price oracle

This page describes how the Inbox charges and splits native fees, how operators configure minimums, and how application developers should estimate `msg.value` and the callback slice before calling payable send paths.

Canonical sources:

- `/contracts/fee/InboxFeeManager.sol`
- `/contracts/fee/PriceOracle.sol`
- `/contracts/InboxBase.sol`
- `/contracts/InboxMiner.sol`
- `/contracts/IInbox.sol`
- `/contracts/mpc/PodLibBase.sol`

## Mental model

1. **Users pay on the source chain** in that chain’s native token (`msg.value` on `sendTwoWayMessage` / `sendOneWayMessage`, or the `totalValueWei` you forward from `PodLib`).
2. The Inbox **converts wei to gas units** using the transaction’s effective gas price: `tx.gasprice`, or `DEFAULT_GAS_PRICE` (2 gwei) when `tx.gasprice == 0`.
3. Stored request fields **`targetFee` and `callerFee` are gas-unit budgets**, not wei. The miner executes the remote call with `call{gas: …}` capped by a budget derived from `targetFee` (see `_localRequestExecutionBudget` in `InboxFeeManager`).
4. A **price oracle** supplies cached USD prices for the local and remote execution tokens. The ratio is used to map “how much remote gas this local wei can buy” when validating the remote leg.

If this sounds asymmetric, it is intentional: one leg is priced in the **local** token at send time; the protocol still needs a **policy** for minimum gas on each leg and a **conversion** between chains/tokens, which is what `FeeConfig` plus the oracle provide.

## `FeeConfig`: what each field means

Minimum fees are defined by two templates on the Inbox: `localMinFeeConfig` (callback leg on the source chain) and `remoteMinFeeConfig` (execution leg on the destination chain). Both use the same struct (`InboxFeeManager.FeeConfig`):

| Field | Role |
| --- | --- |
| `constantFee` | If **non-zero**, the minimum for that leg is exactly this many **gas units** (template mode). The other template fields are ignored for the minimum calculation. |
| `gasPerByte` | Weight per byte of the measured payload size when `constantFee == 0`. |
| `callbackExecutionGas` | Baseline gas units for execution on that leg (when `constantFee == 0`). |
| `errorLength` | Extra bytes reserved for error-path calldata; contributes `errorLength * gasPerByte` to the template when `constantFee == 0`. |
| `bufferRatioX10000` | Applied as `gasUnits * (10000 + bufferRatioX10000) / 10000` so operators can require headroom above the raw estimate. |

When `constantFee == 0`, the minimum gas units before buffer are:

```text
dataSize * gasPerByte + callbackExecutionGas + errorLength * gasPerByte
```

then the buffer multiplier is applied (see `expectedMinFee` in `InboxFeeManager.sol`).

**Measured `dataSize` on-chain:** for outbound sends, the Inbox uses `abi.encode(methodCall).length` (the full ABI encoding of the `MpcMethodCall` struct), not only the inner `data` field.

## Operator configuration

On `InboxMiner` (owner-gated):

- **`setPriceOracle(address)`** – points fee logic at a `PriceOracle` instance.
- **`updateMinFeeConfigs(local, remote)`** – replaces both templates; each must be valid (either `constantFee > 0` or all non-constant fields non-zero).

On `PriceOracle`:

- Prices are **18-decimal** cached values (`localTokenPriceUSD`, `remoteTokenPriceUSD`).
- **`fetchPrices()`** refreshes caches when the configured interval allows; successful sends on `InboxBase` also call `fetchPrices()` after creating a request (so stale caches can be updated, but **validation reads the cache only** via `getLocalTokenPriceUSD` / `getRemoteTokenPriceUSD`).
- Operators typically set **`fetchInterval`**, **`setLocalTokenPriceUSD` / `setRemoteTokenPriceUSD`** (or override `fetchLocalTokenPriceUSD` / `fetchRemoteTokenPriceUSD` in a derived oracle), and **`setPriceAdmin`** as needed.

If oracle prices are uninitialized or wrong, two-way sends can revert with `TargetFeeTooLow` / `CallbackFeeTooLow` even when `msg.value` seems large enough.

## Two-way sends: total fee (`msg.value`) vs callback fee

### Total fee (`msg.value`)

This is the **entire** native payment attached to `sendTwoWayMessage`. Conceptually it must cover:

- the **remote** execution leg (encode + target contract work), and  
- the **local** return leg (success callback or error delivery via `callerFee` on the follow-up one-way send).

### Callback fee (`callbackFeeLocalWei`)

This is **not** an additional charge on top of `msg.value`. It is a **slice of** `msg.value` reserved for the callback leg:

- **`callbackFeeLocalWei`** must be **&gt; 0** and **≤ `msg.value`**.
- The Inbox converts **`callbackFeeLocalWei / gasPrice`** to gas units → stored as **`callerFee`** on the request (subject to `localMinFeeConfig`).
- The remainder **`msg.value - callbackFeeLocalWei`** funds the remote leg: converted to gas units and **scaled by the oracle ratio** → stored as **`targetFee`** (subject to `remoteMinFeeConfig`).

So:

- **`msg.value`** = total budget you are willing to spend for this two-way message (in local native token).
- **`callbackFeeLocalWei`** = how much of that budget you allocate specifically to delivering the response (or error) back to your contract on the source chain.

!!! note "Callback gas is not paid again on `respond` / `raise`"

    On COTI, `inbox.respond` / `inbox.raise` routes the return message using the **`callerFee`** budget already recorded on the original two-way request (`IInbox` natspec). The return transaction does not re-charge the application for that leg in the same way as the initial split.

`PodLibBase._sendTwoWayWithFee` enforces `callbackFeeLocalWei >= 1` wei and `callbackFeeLocalWei <= totalValueWei` before forwarding to the Inbox.

## One-way sends

`sendOneWayMessage` is **payable** with **no** callback fee parameter: all of `msg.value` (after the same wei→gas and oracle scaling) must satisfy **`remoteMinFeeConfig`** only. `callerFee` on the stored request is zero.

## Estimating fees: `calculateTwoWayFeeRequiredInLocalToken`

`InboxFeeManager` exposes an **off-chain / UI-oriented** view:

```solidity
function calculateTwoWayFeeRequiredInLocalToken(
    uint256 remoteMethodCallSize,
    uint256 callBackMethodCallSize,
    uint256 remoteMethodExecutionGas,
    uint256 callBackMethodExecutionGas,
    uint256 gasPrice
) external view returns (uint256 targetGasRemote, uint256 callerGasLocal);
```

### Parameters (what to pass)

| Parameter | Typical choice |
| --- | --- |
| `remoteMethodCallSize` | Byte length relevant to the **remote** leg. For parity with validation templates, align with the size term your minimum config is meant to approximate (often close to `abi.encode(methodCall).length` for the outbound call). |
| `callBackMethodCallSize` | Byte length relevant to the **callback** payload (encoded callback / error data as it will be routed back). |
| `remoteMethodExecutionGas` | Your estimate of execution gas used on the remote target (beyond the template minimum). |
| `callBackMethodExecutionGas` | Your estimate of execution gas for the callback on the source chain. |
| `gasPrice` | Wei per gas **assumption** for the transaction that will call `sendTwoWayMessage`. Use the effective gas price you expect (legacy `gasPrice` or EIP-1559 effective price). |

### Return values (how to use them)

Both values are expressed in **local native token wei** (the same unit as `msg.value`), after scaling the remote leg with **`remoteTokenPriceUSD` / `localTokenPriceUSD`** so the first component is comparable to paying from the local token.

Suggested pattern:

1. Call `calculateTwoWayFeeRequiredInLocalToken(...)` on the **deployed Inbox** you will use (same fee configs and oracle as production).
2. Let `(remotePart, callbackPart)` be the two returns.
3. Set **`callbackFeeLocalWei`** ≥ `callbackPart` plus a safety margin.
4. Set **`msg.value`** ≥ `remotePart + callbackPart` plus a safety margin (and ensure **`callbackFeeLocalWei` ≤ `msg.value`**).

This helper is **not** a substitute for integration tests: rounding, `tx.gasprice` differences from your assumption, and payload size drift can still cause `TargetFeeTooLow` or `CallbackFeeTooLow` reverts if margins are too tight.

!!! warning "Estimator vs on-chain validation"

    On-chain checks use **`tx.gasprice`** at execution time and **`abi.encode(methodCall).length`** for the outbound struct. The estimator’s size parameters are **your** inputs; they must match reality closely enough for the estimate to be meaningful. The contract natspec also notes that return names are partly historical; treat the numeric outputs as **wei-level hints in local token terms**, not as alternate storage for `targetFee` / `callerFee`.

## Validation errors you may see

| Error | Meaning |
| --- | --- |
| `TotalFeeTooLow` | `msg.value == 0` (two-way or one-way). |
| `CallbackFeeTooLow` | Zero callback fee, callback exceeds total, or **gas units** from `callbackFeeLocalWei / gasPrice` below local template minimum. |
| `TargetFeeTooLow` | After conversion and oracle scaling, remote gas units below `remoteMinFeeConfig` minimum. |
| `FeeConfigInvalid` | Owner tried to set an invalid template (e.g. `constantFee == 0` but a required field is zero). |
| `PriceOracleNotInitialized` | Thrown by other fee/oracle paths if the oracle is missing (constructor wiring depends on deployment). |

## References in examples

- **`MpcAdder`**: `add(..., uint256 callbackFeeLocalWei) external payable` passes `msg.value` and `callbackFeeLocalWei` into `add64`.
- **`Millionaire`**: `reveal(..., uint256 callbackFeeLocalWei) external payable` splits `msg.value` across two `gt64` calls and caps the per-send callback slice.
- **`PErc20`**: `transfer(..., uint256 callbackFeeLocalWei) external payable` uses `_sendTwoWayWithFee`.

## Related documentation

- [Request builder and remote calls](03-request-builder-and-remote-calls.md) – constructing `methodCall` and calling the Inbox.
- [Contract patterns and checklist](02-contract-patterns-and-checklist.md) – production checklist including fee testing.
- [Multi-party Computing library (MpCLib)](../05b-multi-party-computing-library-mpclib.md) – `PodLib` helpers that forward fees.
