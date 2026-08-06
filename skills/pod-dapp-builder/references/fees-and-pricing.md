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

## Maximum method-call size (required for apps)

The Inbox admits messages by **payload weight**, not `abi.encode(methodCall).length`:

```text
weight = data.length + datatypes.length * 32 + datalens.length * 32
```

| Cap | Limits | Typical default |
| --- | --- | --- |
| `FeeConfig.maxMethodCallBytes` | Create / ingest | **8192** |
| `maxReplyMethodCallBytes` | `respond` / `raise` return legs | **8192** |
| `FeeConfig.maxExecutionGas` | Gas-unit budget on `targetFee` / `callerFee` | Network policy |

Oversized create/ingest → `MethodCallTooLarge`. Oversized reply → `ResponseOutOfBounds`.  
Read live caps from the Inbox (`remoteMinFeeConfig` / `localMinFeeConfig`, `maxReplyMethodCallBytes`) before building large encrypted or dynamic args. Canonical user doc: [how-poa-fees-work.md](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/how-poa-fees-work.md#maximum-method-call-size-apps-must-respect-this). Operator detail: [SIZE_CAPS_AND_MINER_REJECT.md](https://github.com/coti-io/coti-pod-inbox-contracts/blob/main/docs/SIZE_CAPS_AND_MINER_REJECT.md).

## Operator configuration

- `InboxMiner.setPriceOracle`, `updateMinFeeConfigs` — [`coti-pod-inbox-contracts`](https://github.com/coti-io/coti-pod-inbox-contracts).
- `FeeConfig`: constant minimum gas units or template (`gasPerByte`, `callbackExecutionGas`, `errorLength`, `bufferRatioX10000`, **`gasPriceMul` / `gasPriceDiv`** for cross-chain gas-price skew). Defaults `mul/div = 1/1`; both must be non-zero.
- Size / budget caps above are **always required**, including constant-fee mode (`constantFee > 0` does not allow omitting them).

## Miner execution gas (mine path)

Miners / CMS should not size `batchProcessRequests` from `targetFee × 64/63` alone. Use:

1. Public `estimateExecutionGasForMiner(sourceChainId, mined, maxUserGas)` → always-reverts with `ExecutionGasEstimate(gasUsed, responseDataSize, errorDataSize)`.
2. Buffer `gasUsed`, pack batches by projected cost, then `eth_estimateGas` the full tx.
3. `gasLimit = max(projected, eth_estimateGas)`.

Canonical write-up: [`ESTIMATE_EXECUTION_GAS.md`](https://github.com/coti-io/coti-pod-inbox-contracts/blob/main/docs/ESTIMATE_EXECUTION_GAS.md). Shared planners: PEI `scripts/inbox-mine-gas.ts`, CMS `app/modules/pod-inbox-relay/mine_gas.py`.

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

**TypeScript** (`@coti-io/pod-sdk`):

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
- Oversized method call: `MethodCallTooLarge` (create/ingest payload weight).
- Oversized reply: `ResponseOutOfBounds` (`respond` / `raise` weight).
- Test both revert paths plus success with buffered estimate.

## Fault testing

Use [`MpcAdderPausable.sol`](https://github.com/coti-io/coti-contracts/blob/main/contracts/pod/examples/MpcAdderPausable.sol): COTI execution can succeed while host-chain callback reverts when paused — verify `PodRequest` / `ErrorRemoteCall` / UI failed state.
