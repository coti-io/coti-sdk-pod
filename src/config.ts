/**
 * Shared SDK configuration — pure data, JSON-serialisable.
 *
 * Consumed by both {@link PodContract} (for inbox + encryption resolution) and
 * {@link PodRequest} (for cross-chain request tracking).
 */

/** Per-chain entry used inside {@link PodSdkConfig.chains}. */
export interface PodChainConfig {
  /** EIP-155 chain id. */
  chainId: number;
  /** Deployed PoD inbox address on this chain. */
  inboxAddress: string;
  /** JSON-RPC endpoint. */
  rpcUrl: string;
}

/** Unified SDK config shared between `PodContract` and `PodRequest`. */
export interface PodSdkConfig {
  chains: PodChainConfig[];
  /** Defaults to `"testnet"`. `PodContract` uses this as the encryption service target. */
  encryptionNetwork?: "testnet" | "mainnet" | string;
}
