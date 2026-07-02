/**
 * Default PoD Inbox addresses by chain id.
 * Source: `@coti-io/coti-contracts` `PodNetworkConstants.INBOX` (CREATE3, same on all chains).
 */

/** Shared CREATE3 inbox on Sepolia, COTI testnet, and Avalanche Fuji. */
export const DEFAULT_INBOX_ADDRESS =
  "0xAb625bE229F603f6BBF964474AFf6d5487e364De" as const;

/** Sepolia (11155111) — EVM-side inbox. */
export const SEPOLIA_DEFAULT_INBOX_ADDRESS = DEFAULT_INBOX_ADDRESS;

/** COTI testnet (7082400) — COTI-side inbox. */
export const COTI_TESTNET_DEFAULT_INBOX_ADDRESS = DEFAULT_INBOX_ADDRESS;

/** Avalanche Fuji (43113) — EVM-side inbox. */
export const FUJI_DEFAULT_INBOX_ADDRESS = DEFAULT_INBOX_ADDRESS;

/**
 * `chainId` as decimal string → default inbox for fee estimation / log filtering.
 *
 * Testnet entries only — mainnet deployments require explicit `PodSdkConfig.chains`
 * or `PodContract` `inboxAddress` override.
 */
export const DEFAULT_INBOX_ADDRESS_BY_CHAIN_ID: Readonly<Record<string, string>> =
  Object.freeze({
    "11155111": SEPOLIA_DEFAULT_INBOX_ADDRESS,
    "43113": FUJI_DEFAULT_INBOX_ADDRESS,
    "7082400": COTI_TESTNET_DEFAULT_INBOX_ADDRESS,
  });
