# Fees And Pricing

Canonical doc: [how-poa-fees-work.md](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/how-poa-fees-work.md).

Implementation: [`InboxFeeManager.sol`](https://github.com/coti-io/coti-pod-inbox-contracts/blob/main/contracts/fee/InboxFeeManager.sol) in `@coti-io/coti-pod-inbox-contracts`.

## Purpose

Fee handling is mandatory for successful remote execution and callback delivery on two-way PoD flows.

## Core model

- Pay in **local native token** as `msg.value` on `IInbox.sendTwoWayMessage`.
- Inbox converts wei → **gas-unit budgets** using `tx.gasprice`.
- Two-way split:
  - **Remote leg** → `Request.targetFee` (gas units, oracle-scaled).
  - **Callback leg** → `callbackFeeLocalWei` slice of total → `Request.callerFee`.
- `callbackFeeLocalWei` is a **slice of** `msg.value`, not an add-on.

## Operator configuration

- `InboxMiner.setPriceOracle`, `updateMinFeeConfigs` — [`coti-pod-inbox-contracts`](https://github.com/coti-io/coti-pod-inbox-contracts).
- `FeeConfig`: constant minimum gas units or template (`gasPerByte`, `callbackExecutionGas`, `errorLength`, `bufferRatioX10000`).

## Estimation (off-chain / UI)

**On-chain view** (deployed Inbox):

```
calculateTwoWayFeeRequiredInLocalToken(
  remoteMethodCallSize,
  callBackMethodCallSize,
  remoteMethodExecutionGas,
  callBackMethodExecutionGas,
  gasPrice
)
```

Returns remote and callback budgets in **local wei**.

**TypeScript** (`@coti/pod-sdk`):

```typescript
const pod = new PodContract(appAddress, abi, signer, { config });
const fee = await pod.estimateFee("add", podArgs, {
  forwardGasLimit: 400_000n,
  callBackGasLimit: 250_000n,
  callBackDataSize: 512n,
  gasPrice: (await signer.provider!.getFeeData()).gasPrice!,
});
// fee.totalFee, fee.remoteFee, fee.callBackFee
```

Mark exactly one `PodMethodArgument` with `isCallBackFee: true` — `PodContract` injects `fee.callBackFee` before send.

## Dispatch patterns

**PodLib helpers** — pass `msg.value` as `totalValueWei` and `callbackFeeLocalWei` into `add64`, `add256`, `_sendTwoWayWithFee`, etc.

**Direct Inbox** — `sendTwoWayMessage{value: totalFee}(..., callbackFeeLocalWei)`.

## Validation

- Underfunded total: `TotalFeeTooLow`, `TargetFeeTooLow`.
- Underfunded callback: `CallbackFeeTooLow`.
- Test both revert paths plus success with buffered estimate.

## Fault testing

Use [`MpcAdderPausable.sol`](https://github.com/coti-io/coti-contracts/blob/main/contracts/pod/examples/MpcAdderPausable.sol): COTI execution can succeed while host-chain callback reverts when paused — verify `PodRequest` / `ErrorRemoteCall` / UI failed state.
