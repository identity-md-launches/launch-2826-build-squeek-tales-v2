import { useEffect, useState } from "react";
import { publicClient } from "./config";
import { friendlyError } from "./data";
import type { Hash } from "viem";
export type Transaction = {
  action: string;
  hash?: Hash;
  status: "idle" | "signature" | "pending" | "confirmed" | "failed" | "unknown";
  message?: string;
};
export function useTransaction(key: string, onConfirmed: () => void) {
  const storageKey = `squeek.tx.v2.${key}`;
  const [tx, setTx] = useState<Transaction>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (value?.hash && /^0x[a-fA-F0-9]{64}$/.test(value.hash))
        return {
          ...value,
          status: value.status === "pending" ? "unknown" : value.status,
        };
    } catch {
      /* storage optional */
    }
    return { status: "idle", action: "" };
  });
  useEffect(() => {
    try {
      if (tx.hash) localStorage.setItem(storageKey, JSON.stringify(tx));
    } catch {
      /* wallet remains usable without storage */
    }
  }, [tx, storageKey]);
  async function wait(hash: Hash, action: string) {
    setTx({ action, hash, status: "pending" });
    try {
      let replaced = false;
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 2,
        timeout: 120_000,
        onReplaced: (replacement) => {
          if (replacement.reason !== "repriced") replaced = true;
          hash = replacement.transaction.hash;
          setTx({ action, hash, status: "pending" });
        },
      });
      if (replaced) {
        setTx({
          action,
          hash,
          status: "failed",
          message:
            "Your wallet replaced or cancelled this transaction. Refresh the page and check the explorer before trying again.",
        });
        onConfirmed();
        return null;
      }
      if (receipt.status === "reverted")
        setTx({
          action,
          hash,
          status: "failed",
          message:
            "The transaction reverted. No vote or claim was recorded. Refresh and try again.",
        });
      else {
        setTx({ action, hash, status: "confirmed" });
        onConfirmed();
      }
      return receipt;
    } catch {
      setTx({
        action,
        hash,
        status: "unknown",
        message:
          "Confirmation is taking longer. Check the explorer or check the status again before sending another transaction.",
      });
      return null;
    }
  }
  async function run(action: string, send: () => Promise<Hash>) {
    setTx({ action, status: "signature" });
    try {
      const hash = await send();
      return await wait(hash, action);
    } catch (error) {
      setTx({ action, status: "failed", message: friendlyError(error) });
      return null;
    }
  }
  return {
    tx,
    run,
    recheck: () => tx.hash && wait(tx.hash, tx.action),
    busy:
      tx.status === "signature" ||
      tx.status === "pending" ||
      tx.status === "unknown",
  };
}
