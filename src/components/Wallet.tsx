import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  type Connector,
} from "wagmi";
import { shortAddress, explorerAddress } from "../lib/config";
import { OPEN_IN, isMobileBrowser } from "../lib/open-in";
import { friendlyError } from "../lib/data";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
const WalletContext = createContext<() => void>(() => {});
export const useOpenWallet = () => useContext(WalletContext);
const mark = (name: string) => `./wallets/${name}.svg`;
const connectorIcon = (c: Connector) =>
  c.icon ?? (c.id === "coinbaseWalletSDK" ? mark("coinbase") : mark("browser"));
export function WalletProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connectAsync, isPending, variables } = useConnect();
  const { disconnect } = useDisconnect();
  useEffect(() => {
    if (isConnected) setOpen(false);
  }, [isConnected]);
  const named = connectors.some(
    (c) => c.type === "injected" && c.id !== "injected",
  );
  const mobile = isMobileBrowser() && !named;
  const listed = [
    ...connectors.filter((c) => c.type === "injected"),
    ...connectors.filter((c) => c.type !== "injected"),
  ].filter(
    (c) =>
      !(c.id === "injected" && named) && (!mobile || c.type !== "injected"),
  );
  async function connect(connector: Connector) {
    setMessage("");
    try {
      await connectAsync({ connector });
      setOpen(false);
    } catch (error) {
      setMessage(
        connector.id === "injected" && !("ethereum" in window)
          ? "No browser wallet found. Install a wallet extension or choose Coinbase Wallet."
          : friendlyError(error),
      );
    }
  }
  return (
    <WalletContext.Provider
      value={() => {
        setMessage("");
        setOpen(true);
      }}
    >
      {children}
      <Modal
        title={isConnected ? "Connected wallet" : "Connect a wallet"}
        open={open}
        onClose={() => setOpen(false)}
        className="wallet-modal"
      >
        {isConnected && address ? (
          <>
            <p className="muted">
              Connected on{" "}
              {chainId === 11155111 ? "Ethereum Sepolia" : "another network"}.
            </p>
            <a
              href={explorerAddress(address)}
              className="full-address"
              target="_blank"
              rel="noreferrer"
            >
              {address}
              <Icon name="external" size={16} />
            </a>
            <button
              className="button secondary full"
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
            >
              Disconnect wallet
            </button>
          </>
        ) : (
          <>
            <p className="muted">A tiny adventure. Your own wallet.</p>
            <div className="wallet-rows">
              {mobile &&
                OPEN_IN.map((w) => (
                  <a
                    key={w.id}
                    href={w.href(location.href)}
                    className="wallet-row"
                  >
                    <img src={mark(w.id)} width="28" height="28" alt="" />
                    <span>Open in {w.name}</span>
                    <Icon name="external" size={16} />
                  </a>
                ))}
              {listed.map((c) => (
                <button
                  className="wallet-row"
                  key={c.uid}
                  onClick={() => connect(c)}
                  disabled={isPending}
                >
                  <img src={connectorIcon(c)} width="28" height="28" alt="" />
                  <span>
                    {c.id === "injected"
                      ? "Browser wallet"
                      : c.id === "coinbaseWalletSDK" && mobile
                        ? "Coinbase Smart Wallet"
                        : c.name}
                    {isPending && variables?.connector === c
                      ? " · opening…"
                      : ""}
                  </span>
                  <Icon name="chevron" size={16} />
                </button>
              ))}
            </div>
            <p role="status" className="error-text">
              {message}
            </p>
            <p className="small muted">
              Votes use Sepolia test ETH for gas. Connecting never sends a
              transaction.
            </p>
          </>
        )}
      </Modal>
    </WalletContext.Provider>
  );
}
export function WalletControl() {
  const open = useOpenWallet();
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync, isPending } = useSwitchChain();
  const [error, setError] = useState("");
  if (isConnected && chainId !== 11155111)
    return (
      <div className="wallet-control">
        <button
          className="button wallet-button"
          disabled={isPending}
          onClick={async () => {
            try {
              setError("");
              await switchChainAsync({ chainId: 11155111 });
            } catch (e) {
              setError(friendlyError(e));
            }
          }}
        >
          {isPending ? "Switching…" : "Switch to Sepolia"}
        </button>
        {error && (
          <span className="wallet-error" role="alert">
            {error}
            <button onClick={open}>Wallet settings</button>
          </span>
        )}
      </div>
    );
  return (
    <button className="button wallet-button" onClick={open}>
      <Icon name="wallet" size={17} />
      <span>
        {isConnected && address ? shortAddress(address) : "Connect wallet"}
      </span>
    </button>
  );
}
