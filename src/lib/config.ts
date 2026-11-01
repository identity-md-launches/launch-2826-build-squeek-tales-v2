import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors/injected";
import { coinbaseWallet } from "wagmi/connectors/coinbaseWallet";
import { sepolia } from "viem/chains";
import { createPublicClient, fallback, http as viemHttp } from "viem";

export const API = "https://api.squeekchain.com/v1";
export const RPC = "https://ethereum-sepolia-rpc.publicnode.com";
export const chain = sepolia;
export const publicClient = createPublicClient({
  chain,
  transport: fallback([
    viemHttp(RPC, { timeout: 12_000, retryCount: 1 }),
    viemHttp("https://rpc.sepolia.org", { timeout: 12_000, retryCount: 0 }),
  ]),
});
export const config = createConfig({
  chains: [sepolia],
  multiInjectedProviderDiscovery: true,
  connectors: [
    injected(),
    coinbaseWallet({
      appName: "Squeek Tales",
      appLogoUrl: new URL("favicon.svg", document.baseURI).href,
      preference: { options: "all" },
    }),
  ],
  transports: { [sepolia.id]: http(RPC) },
});
export const explorerTx = (hash: string) =>
  `https://sepolia.etherscan.io/tx/${hash}`;
export const explorerAddress = (address: string) =>
  `https://sepolia.etherscan.io/address/${address}`;
export const shortAddress = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
