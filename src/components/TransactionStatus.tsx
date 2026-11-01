import { explorerTx } from "../lib/config";
import type { Transaction } from "../lib/transaction";
import { Icon } from "./Icon";
export function TransactionStatus({
  tx,
  recheck,
}: {
  tx: Transaction;
  recheck: () => unknown;
}) {
  if (tx.status === "idle") return null;
  const label = {
    signature: "Confirm in your wallet",
    pending: "Waiting for 2 confirmations",
    confirmed: `${tx.action} confirmed`,
    failed: `${tx.action} failed`,
    unknown: "Confirmation not yet known",
    idle: "",
  }[tx.status];
  return (
    <div className={`transaction-status ${tx.status}`} role="status">
      <div className="inline">
        <Icon
          name={
            tx.status === "confirmed"
              ? "check"
              : tx.status === "failed"
                ? "info"
                : "clock"
          }
          size={18}
        />
        <strong>{label}</strong>
      </div>
      {tx.message && <p>{tx.message}</p>}
      {tx.hash && (
        <a
          href={explorerTx(tx.hash)}
          target="_blank"
          rel="noreferrer"
          className="transaction-hash"
        >
          {tx.hash}
          <Icon name="external" size={14} />
        </a>
      )}
      {tx.status === "unknown" && (
        <button className="text-button" onClick={recheck}>
          Check transaction status
        </button>
      )}
    </div>
  );
}
