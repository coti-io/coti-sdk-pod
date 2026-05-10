# Encrypt / decrypt

This page documents `CotiPodCrypto` from `/src/coti-pod-crypto.ts`.

Encryption calls the **PoD encryption service** (`buildEncryptedValue`); no wallet required.

## API

```typescript
CotiPodCrypto.encrypt(value, networkOrUrl, dataType?)
CotiPodCrypto.decrypt(ciphertext, aesKey, dataType?)
```

## Encrypt parameters

- **value** – Plaintext (numeric string, `"true"`/`"false"`, or string for `String` type).
- **networkOrUrl** – `"testnet"`, `"mainnet"`, or a full service base URL.
- **dataType** – Optional; defaults to `Uint64`.

## Supported `DataType`

- `Bool`, `Uint8`, `Uint16`, `Uint32`, `Uint64`, `Uint128`, `Uint256`, `String`

## Network resolution

- `testnet` → `https://fullnode.testnet.coti.io/pod-encryption`
- `mainnet` → `https://pod-encryption-service-mainnet.coti.io`
- Or pass a full custom base URL.

## Return shapes from `encrypt`

- Scalar types: `{ ciphertext: string, signature: string }`
- String type: `{ ciphertext: { value: string[] }, signature: string[] }`

## Example: encrypt and submit for `itUint64`

```typescript
import { CotiPodCrypto, DataType } from "@coti/pod-sdk";

const enc = await CotiPodCrypto.encrypt("42", "testnet", DataType.Uint64);
const itAmount = {
  ciphertext: BigInt((enc as { ciphertext: string }).ciphertext),
  signature: (enc as { signature: string }).signature,
};

// await contract.somePrivateMethod(itAmount)
```

## Example: decrypt callback output

```typescript
const amount = CotiPodCrypto.decrypt("0x...", accountAesKey, DataType.Uint64);
const flag = CotiPodCrypto.decrypt("0x...", accountAesKey, DataType.Bool);
const text = CotiPodCrypto.decrypt({ value: ["123", "456"] }, accountAesKey, DataType.String);
```

## Behavior details

- Empty ciphertext (`""`, `"0x"`, `"0x0"`) returns `"0"` for numeric types and `"false"` for bool.
- String decrypt accepts object form (`{ value: ... }`) or JSON string form.

## Error behavior

`encrypt(...)` throws when:

- The service returns a non-2xx response,
- Required fields are missing in the response.

`decrypt(...)` throws when:

- AES key is missing/empty,
- string ciphertext JSON is invalid.

## Correctness rules

- Encrypt with the same logical type expected by Solidity argument.
- Decrypt with the same logical type returned by callback result.
- Keep numeric widths consistent end-to-end.
