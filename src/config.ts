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
  /** Additional encryption service base URLs trusted besides official endpoints. */
  trustedEncryptionServiceUrls?: string[];
  /**
   * When true, allows any HTTPS encryption service URL (not recommended for production).
   */
  allowUnlistedEncryptionUrl?: boolean;
  /** When false, skips client-side IT signature verification on pre-encrypted JSON args. */
  verifyItSignature?: boolean;
}
