# Fees And Pricing

## Purpose

Use this reference whenever building or converting PoD request flows. Fee handling is mandatory for successful remote execution and callback delivery.

## Core Model

- Every outbound two-way request must carry fee value in **local native token** as `msg.value` on `IInbox.sendTwoWayMessage`.
- The Inbox converts **wei → gas units** using `tx.gasprice` (or `DEFAULT_GAS_PRICE` when zero).
- Stored `Request.targetFee` and `Request.callerFee` are **gas-unit budgets**, not wei.
- For two-way flows, you split `msg.value` into:
  - **Remote leg** → becomes `targetFee` (after oracle scaling for minimum checks).
  - **Callback leg** → `callbackFeeLocalWei` → becomes `callerFee` in gas units.
- `sendTwoWayMessage` takes `callbackFeeLocalWei` and uses `msg.value` as **total** fee (the callback argument is a slice of the total, not an add-on).

## Operator configuration

- `InboxMiner.setPriceOracle` and `updateMinFeeConfigs(local, remote)` define oracle address and `FeeConfig` templates (`InboxFeeManager`).
- `FeeConfig` is either **constant** minimum gas units (`constantFee > 0`) or a **template** with `gasPerByte`, `callbackExecutionGas`, `errorLength`, and `bufferRatioX10000`.
- On-chain validation uses `abi.encode(methodCall).length` as the payload size term for minima.

## Mandatory estimation API (off-chain / UI)

On the deployed Inbox (same `FeeConfig` and oracle as production):

`calculateTwoWayFeeRequiredInLocalToken(remoteMethodCallSize, callBackMethodCallSize, remoteMethodExecutionGas, callBackMethodExecutionGas, gasPrice)`

Interpretation:

- `remoteMethodCallSize` / `callBackMethodCallSize`: byte sizes for template alignment (match real encoded payloads as closely as possible).
- `remoteMethodExecutionGas` / `callBackMethodExecutionGas`: expected execution gas beyond template minima.
- `gasPrice`: wei-per-gas assumption matching the send transaction’s effective price.

Returns (both in **local native wei**, remote leg scaled via oracle ratio):

- First: budget attributable to the **remote** leg in local-token terms.
- Second: budget attributable to the **callback** leg.

Use them to choose `callbackFeeLocalWei` and `msg.value` with safety margin. See repository doc `/docs/contracts/04-fees-gas-and-oracle.md`.

## Practical Assumptions

- Use the same gas price assumption as the wallet will use for the send tx.
- Add safety headroom above estimator output.
- Ensure `callbackFeeLocalWei` is:
  - Greater than zero.
  - Less than or equal to total fee (`msg.value`).
  - Large enough in **gas units** after `/ gasPrice` to satisfy `localMinFeeConfig`.

## Dispatch Patterns

Using `PodLib` / `PodLibBase`:

- Pass `msg.value` as `totalValueWei` and explicit `callbackFeeLocalWei` into helpers such as `add64` / `gt64` / `_sendTwoWayWithFee`.

Direct Inbox calls:

- Call `sendTwoWayMessage{value: totalFee}(..., callbackFeeLocalWei)`.

## Validation And Failure Behavior

- Underfunded total fee can revert (`TotalFeeTooLow`, `TargetFeeTooLow`).
- Underfunded callback slice can revert (`CallbackFeeTooLow`).
- Treat fee-related failures as first-class test scenarios.

## Test Guidance

At minimum include:

1. Success case with estimated+buffered fees.
2. Revert case with too-low total fee.
3. Revert case with too-low callback fee.
4. Two-way response path where callback budget is consumed as expected.
