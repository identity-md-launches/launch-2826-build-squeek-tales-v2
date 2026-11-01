import { useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { type Address } from "viem";
import { PATHS, type Branch } from "../lib/story";
import { publicClient } from "../lib/config";
import {
  talesAbi,
  verifyTales,
  type Board,
  type CoreSnapshot,
} from "../lib/data";
import { useTransaction } from "../lib/transaction";
import { Icon, type IconName } from "./Icon";
import { TransactionStatus } from "./TransactionStatus";
import { useOpenWallet } from "./Wallet";
export function VotePanel({
  mode,
  selected,
  setSelected,
  onPractice,
  core,
  contract,
  board,
  refresh,
  loading,
}: {
  mode: "live" | "practice";
  selected: Branch;
  setSelected: (b: Branch) => void;
  onPractice: () => void;
  core?: CoreSnapshot;
  contract: Address | null;
  board?: Board;
  refresh: () => void;
  loading: boolean;
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
  const openWallet = useOpenWallet();
  const { tx, run, busy, recheck } = useTransaction(
    `vote.${address ?? "none"}.${contract ?? "none"}`,
    refresh,
  );
  const [notice, setNotice] = useState("");
  const preview = mode === "practice" || !contract;
  const alreadyVoted = mode === "live" && Boolean(board?.vote);
  const unavailable =
    !preview &&
    (busy ||
      loading ||
      !core ||
      core.paused ||
      !board ||
      alreadyVoted ||
      (!!address && (chainId !== 11155111 || !wallet)));
  async function submit() {
    setNotice("");
    if (preview) {
      onPractice();
      return;
    }
    if (!address) {
      openWallet();
      return;
    }
    if (!wallet || !core || !contract || chainId !== 11155111) return;
    await run(`Vote for round ${board?.currentRound.toString()}`, async () => {
      await verifyTales(contract, core.core);
      const round = (await publicClient.readContract({
        address: contract,
        abi: talesAbi,
        functionName: "currentRound",
      })) as bigint;
      if (round !== board?.currentRound) {
        refresh();
        throw new Error("RoundNotOpen");
      }
      const { request } = await publicClient.simulateContract({
        address: contract,
        abi: talesAbi,
        functionName: "vote",
        args: [round, selected],
        account: address,
      });
      return wallet.writeContract(request);
    });
  }
  const totalVotes = board?.tallies.reduce((a, b) => a + b, 0) ?? 0;
  return (
    <section className="vote-panel" aria-labelledby="vote-heading">
      <div className="section-head">
        <h2 id="vote-heading">Where to next?</h2>
        <Icon name="sparkles" className="accent" />
      </div>
      <p className="panel-description">You choose Squeek’s next adventure.</p>
      <fieldset className="path-options">
        <legend className="sr-only">Choose the next story branch</legend>
        {PATHS.map((path, i) => (
          <label
            className={`path-option ${selected === i ? "selected" : ""}`}
            key={path.name}
          >
            <input
              type="radio"
              name="branch"
              checked={selected === i}
              onChange={() => {
                setSelected(i as Branch);
                setNotice("");
              }}
              disabled={busy || alreadyVoted}
            />
            <span className="path-icon">
              <Icon name={path.icon as IconName} size={23} />
            </span>
            <span className="path-label">
              <strong>{path.name}</strong>
              <span className="small muted">{path.detail}</span>
            </span>
            <span className="radio-mark" aria-hidden="true">
              {selected === i && <span />}
            </span>
            {!preview && totalVotes > 0 && (
              <span className="path-percentage small">
                {Math.round(((board?.tallies[i] ?? 0) / totalVotes) * 100)}%
              </span>
            )}
          </label>
        ))}
      </fieldset>
      <button
        className="button primary full vote-action"
        disabled={unavailable}
        onClick={submit}
      >
        <span>
          {busy
            ? tx.status === "signature"
              ? "Confirm your vote…"
              : "Checking your vote…"
            : alreadyVoted
              ? "You voted this round"
              : !preview && address && chainId === 11155111 && !wallet
                ? walletError
                  ? "Wallet unavailable"
                  : "Preparing wallet…"
                : preview
                  ? mode === "practice"
                    ? "Take this path"
                    : "Preview this path"
                  : loading
                    ? "Loading the round…"
                    : !core
                      ? "Waiting for verified rounds"
                      : core.paused
                        ? "Settlement is paused"
                        : "Vote for this path"}
        </span>
        <Icon name={alreadyVoted ? "check" : "arrow"} size={18} />
      </button>
      <p className="vote-footnote small muted">
        {preview
          ? mode === "practice"
            ? "Practice play · no wallet or rewards"
            : "Practice preview · on-chain voting awaits deployment"
          : alreadyVoted
            ? `Your choice: ${PATHS[(board?.vote ?? 1) - 1]?.name}. A new vote opens next round.`
            : !core
              ? "Story reads are paused. Retry the source below."
              : address && chainId !== 11155111
                ? "Switch to Sepolia using the wallet control."
                : !board && !loading
                  ? "Voting data is unavailable. Refresh to try again."
                  : "One vote per wallet each round. Sepolia gas applies."}
      </p>
      {notice && <p role="status">{notice}</p>}
      {walletError && address && chainId === 11155111 && (
        <p className="error-text small">
          Your wallet could not prepare the transaction.{" "}
          <button className="text-button" onClick={() => void retryWallet()}>
            Retry wallet
          </button>
        </p>
      )}
      <TransactionStatus tx={tx} recheck={recheck} />
    </section>
  );
}
