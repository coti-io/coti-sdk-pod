# TypeScript integration (UX development)

This guide covers client integration needed to submit private inputs and read private outputs.

## Responsibilities split

Frontend:

- collect plaintext input,
- produce `it*` payload before tx submission,
- read `ct*` results from contract,
- decrypt `ct*` locally using account AES key.

Backend/wallet service:

- supports account key-share onboarding,
- returns encrypted key shares,
- should not receive plaintext private outputs unless explicitly required by product design.

## End-to-end flow

1. Onboard account and recover AES key.
2. Encrypt/sign input for contract call.
3. Submit transaction.
4. Wait for async request completion.
5. Read `ct*` result from contract.
6. Decrypt locally.

## Which library to use

- `@coti/pod-sdk` (full reference: [@coti/pod-sdk reference](06d-pod-sdk.md)):
  - `CotiPodCrypto.encrypt/decrypt` for fast UX integration,
  - `PodContract` to submit PoD method calls (fee math + encryption + receipt parsing),
  - `PodRequest` to track the async request lifecycle and drive UI status updates.
- `@coti-io/coti-sdk-typescript`:
  - typed input builders (`buildInputText`, `buildStringInputText`),
  - low-level decrypt and key recovery functions.

## Data mapping checklist

For Solidity `itUint64`:

- expected shape: `{ ciphertext: uint256-like, signature: bytes-like }`
- convert encryption ciphertext string to `BigInt` before contract call if needed by your ethers client typing.

For Solidity `itString`:

- expected shape: `{ ciphertext: { value: uint256-like[] }, signature: bytes-like[] }`

For callback outputs:

- `ctUint64` -> decrypt using `DataType.Uint64`
- `ctBool` -> decrypt using `DataType.Bool`
- `ctString` -> decrypt using `DataType.String`

## Production UX/security notes

- Treat account AES key as highly sensitive.
- Avoid logging ciphertext-signature payloads alongside identifying metadata.
- Ensure dApp can show async request states (`pending/completed/failed`).
- Ensure decrypt path is consistent across web/mobile environments.
- For payable contract calls, estimate **`value`** and **`callbackFeeLocalWei`** (if the ABI exposes them) using the deployed Inbox’s `calculateTwoWayFeeRequiredInLocalToken` view where possible; see `/docs/contracts/04-fees-gas-and-oracle.md`.
