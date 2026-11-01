import { useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import {
  getAddress,
  isAddress,
  parseEther,
  type Address,
  type Abi,
  type Hex,
} from "viem";
import tales from "../generated/SqueekTales.json";
import { type CoreSnapshot, verifyTales } from "../lib/data";
import { explorerAddress } from "../lib/config";
import { useTransaction } from "../lib/transaction";
import { useOpenWallet } from "./Wallet";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { TransactionStatus } from "./TransactionStatus";
export function Setup({
  open,
  onClose,
  core,
  contract,
  onAdopt,
}: {
  open: boolean;
  onClose: () => void;
  core?: CoreSnapshot;
  contract: Address | null;
  onAdopt: (address: Address | null) => void;
}) {
  const { address, chainId } = useAccount();
  const {
    data: wallet,
    error: walletError,
    refetch: retryWallet,
  } = useWalletClient({
    chainId: 11155111,
    query: { enabled: !!address && chainId === 11155111, retry: 1 },
  });
  const connect = useOpenWallet();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [deployment, setDeployment] = useState<{
    address: Address;
    hash: Hex;
    block: string;
  } | null>(null);
  const { tx, run, busy, recheck } = useTransaction(
    `deployment.${address ?? "none"}`,
    () => {
      if (contract) onAdopt(contract);
    },
  );
  function download() {
    const value = {
      chainId: 11155111,
      contractAddress: deployment?.address ?? contract,
      deploymentTransaction: deployment?.hash ?? null,
      deploymentBlock: deployment?.block ?? null,
    };
    const blob = new Blob([JSON.stringify(value, null, 2) + "\n"], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "deployment.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function adopt() {
    if (!core) {
      setError("Wait for verified Squeekchain data before linking a contract.");
      return;
    }
    if (!isAddress(input)) {
      setError("Enter a complete Ethereum contract address.");
      document.getElementById("contract-address")?.focus();
      return;
    }
    setChecking(true);
    setError("");
    try {
      const value = getAddress(input);
      await verifyTales(value, core.core);
      onAdopt(value);
    } catch {
      setError(
        "Unable to verify this contract. Check its Sepolia address and Squeekchain core, then retry.",
      );
    } finally {
      setChecking(false);
    }
  }
  async function deploy() {
    if (!address) {
      onClose();
      connect();
      return;
    }
    if (!wallet || !core || chainId !== 11155111) return;
    const receipt = await run("Deployment", () =>
      wallet.deployContract({
        abi: tales.abi as Abi,
        bytecode: tales.bytecode as Hex,
        args: [core.core],
        value: parseEther("0.0055"),
        account: address,
        chain: wallet.chain,
      }),
    );
    if (receipt?.status === "success" && receipt.contractAddress) {
      const created = getAddress(receipt.contractAddress);
      await verifyTales(created, core.core)
        .then(() => {
          setDeployment({
            address: created,
            hash: receipt.transactionHash,
            block: receipt.blockNumber.toString(),
          });
          onAdopt(created);
        })
        .catch(() =>
          setError(
            "Deployment mined, but verification is not available yet. Check the transaction and link the created address above.",
          ),
        );
    }
  }
  async function fund() {
    if (!address) {
      onClose();
      connect();
      return;
    }
    if (!wallet || !contract || !core || chainId !== 11155111) return;
    await run("Pool funding", async () => {
      await verifyTales(contract, core.core);
      return wallet.sendTransaction({
        account: address,
        chain: wallet.chain,
        to: contract,
        value: parseEther("0.0055"),
      });
    });
  }
  return (
    <Modal
      title="Launch the on-chain adventure"
      open={open}
      onClose={onClose}
      className="setup-modal"
    >
      {contract ? (
        <div className="setup-current">
          <p className="inline">
            <Icon name="check" />
            Voting contract selected
          </p>
          <a
            className="full-address"
            href={explorerAddress(contract)}
            target="_blank"
            rel="noreferrer"
          >
            {contract}
            <Icon name="external" size={16} />
          </a>
          <button className="button secondary full" onClick={download}>
            <Icon name="download" size={17} />
            Download deployment.json
          </button>
          <p className="small muted">
            This browser uses the selected contract. To share it with everyone,
            place this file at public/deployment.json and rebuild the site.
          </p>
          <div className="setup-section">
            <h3>Keep the adventures going</h3>
            <p>
              Add 0.0055 Sepolia ETH to cover another full top-10 day. Deposits
              stay in the contract for eligible rewards.
            </p>
            <button
              className="button secondary full"
              onClick={fund}
              disabled={
                busy ||
                !core ||
                (!!address && (chainId !== 11155111 || !wallet))
              }
            >
              {busy
                ? "Checking funding…"
                : !address
                  ? "Connect to fund the pool"
                  : "Fund pool with 0.0055 ETH"}
              <Icon name="wallet" size={17} />
            </button>
          </div>
          <button
            className="text-button"
            onClick={() => {
              setDeployment(null);
              onAdopt(null);
            }}
          >
            Use the published contract setting
          </button>
        </div>
      ) : (
        <>
          <p className="muted">
            Live chapters are ready. An owner’s funded Sepolia wallet is needed
            to enable shared votes and rewards.
          </p>
          <div className="setup-section">
            <h3>Deploy and fund</h3>
            <p>
              Create this release’s voting contract and put{" "}
              <strong>0.0055 Sepolia ETH</strong> in its reward pool. Your
              wallet also pays deployment gas.
            </p>
            <p className="small muted">
              No private key is requested or stored. There is no owner
              withdrawal; deposited test ETH is reserved for eligible claims.
            </p>
            <button
              className="button primary full"
              onClick={deploy}
              disabled={
                busy ||
                !core ||
                (!!address && (chainId !== 11155111 || !wallet))
              }
            >
              {busy
                ? "Checking deployment…"
                : !address
                  ? "Connect to deploy"
                  : !wallet
                    ? "Preparing wallet…"
                    : "Deploy + fund 0.0055 ETH"}
              <Icon name="arrow" size={17} />
            </button>
            {!core && (
              <p className="small muted">
                Waiting for verified Squeekchain data.
              </p>
            )}
            {address && chainId !== 11155111 && (
              <p className="small error-text">
                Close this panel and switch your wallet to Sepolia.
              </p>
            )}
          </div>
          <div className="setup-section">
            <h3>Use an existing deployment</h3>
            <label className="field-label" htmlFor="contract-address">
              Sepolia voting contract address
            </label>
            <input
              id="contract-address"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              placeholder="Paste the deployed contract address"
              aria-invalid={!!error}
              aria-describedby="setup-error"
            />
            <button
              className="button secondary full"
              onClick={adopt}
              disabled={checking || busy}
            >
              {checking ? "Verifying contract…" : "Verify and use contract"}
            </button>
          </div>
        </>
      )}
      {walletError && address && chainId === 11155111 && (
        <button className="text-button" onClick={() => void retryWallet()}>
          Retry wallet connection
        </button>
      )}
      <p id="setup-error" role="status" className="error-text">
        {error}
      </p>
      <TransactionStatus tx={tx} recheck={recheck} />
    </Modal>
  );
}
