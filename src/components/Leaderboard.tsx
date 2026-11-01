import { useAccount, useWalletClient } from "wagmi";
import { useState } from "react";
import { type Address, formatEther } from "viem";
import {
  type Board,
  type CoreSnapshot,
  talesAbi,
  verifyTales,
} from "../lib/data";
import { publicClient, shortAddress, explorerAddress } from "../lib/config";
import { utcDay, dayLabel, rewardForRank } from "../lib/story";
import { useOpenWallet } from "./Wallet";
import { useTransaction } from "../lib/transaction";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { TransactionStatus } from "./TransactionStatus";
export function Leaderboard({
  day,
  setDay,
  board,
  contract,
  core,
  refresh,
  loading,
  error,
}: {
  day: number;
  setDay: (day: number) => void;
  board?: Board;
  contract: Address | null;
  core?: CoreSnapshot;
  refresh: () => void;
  loading: boolean;
  error: string | null;
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
  const [showRewards, setShowRewards] = useState(false);
  const { tx, run, recheck, busy } = useTransaction(
    `claim.${address ?? "none"}.${contract ?? "none"}`,
    refresh,
  );
  const today = board ? utcDay(Number(board.timestamp)) : utcDay();
  const closed = day < today;
  const eligible = !!board?.rank && closed && !board.claimed;
  const underfunded = !!board && board.amount > board.balance;
  const empty = !board?.rows.length;
  const dateValue = new Date(day * 86_400_000).toISOString().slice(0, 10);
  async function claim() {
    if (!address) {
      openWallet();
      return;
    }
    if (!wallet || !contract || !core || chainId !== 11155111) return;
    await run(`Reward claim for ${dateValue} UTC`, async () => {
      await verifyTales(contract, core.core);
      const { request } = await publicClient.simulateContract({
        address: contract,
        abi: talesAbi,
        functionName: "claim",
        args: [BigInt(day)],
        account: address,
      });
      return wallet.writeContract(request);
    });
  }
  return (
    <section
      id="leaderboard"
      className="leaderboard-grid"
      aria-labelledby="leaderboard-heading"
    >
      <div className="leaderboard-main">
        <div className="leaderboard-heading">
          <div>
            <h2 id="leaderboard-heading">Little legends</h2>
            <p className="muted">The most active storytellers, every day.</p>
          </div>
          <Icon name="trophy" size={28} className="accent" />
        </div>
        <div className="board-toolbar">
          <div className="segmented" role="group" aria-label="Leaderboard day">
            <button
              className={day === today ? "active" : ""}
              onClick={() => setDay(today)}
              aria-pressed={day === today}
            >
              Today
            </button>
            <button
              className={day === today - 1 ? "active" : ""}
              onClick={() => setDay(today - 1)}
              aria-pressed={day === today - 1}
            >
              Yesterday
            </button>
          </div>
          <label className="date-field">
            <span className="sr-only">Leaderboard date in UTC</span>
            <input
              type="date"
              value={dateValue}
              max={new Date(today * 86_400_000).toISOString().slice(0, 10)}
              min="2026-01-01"
              onChange={(e) => {
                const value = Date.parse(e.target.value + "T00:00:00Z");
                if (Number.isFinite(value))
                  setDay(Math.min(today, utcDay(value / 1000)));
              }}
            />
          </label>
        </div>
        <div className="leaderboard-table" aria-busy={loading}>
          <table>
            <caption className="sr-only">
              Top ten voters for {dayLabel(day)}, UTC
            </caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Storyteller</th>
                <th scope="col" className="align-right">
                  Votes
                </th>
                <th scope="col" className="align-right">
                  Reward
                </th>
              </tr>
            </thead>
            <tbody>
              {board?.rows.map((row, i) => (
                <tr
                  key={row.voter}
                  className={
                    row.voter.toLowerCase() === address?.toLowerCase()
                      ? "your-row"
                      : ""
                  }
                >
                  <td>
                    <span className={`rank rank-${i + 1}`}>{i + 1}</span>
                  </td>
                  <td>
                    <a
                      href={explorerAddress(row.voter)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {shortAddress(row.voter)}
                    </a>
                    {row.voter.toLowerCase() === address?.toLowerCase() && (
                      <span className="you-label">you</span>
                    )}
                  </td>
                  <td className="align-right number">{row.votes}</td>
                  <td className="align-right number">
                    {rewardForRank(i + 1)} <span className="unit">ETH</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {empty && (
            <div className="board-empty">
              <span className="empty-seed">
                <Icon name="seed" size={30} />
              </span>
              <h3>
                {loading
                  ? "Finding the little legends…"
                  : error
                    ? "The leaderboard is resting"
                    : contract
                      ? "A new page awaits"
                      : "Your story starts here"}
              </h3>
              <p className="muted">
                {loading
                  ? "Reading confirmed Sepolia votes."
                  : error
                    ? "Unable to read votes. Try refreshing the board."
                    : contract
                      ? "No recorded voters for this UTC day. Vote in an open round to join the story."
                      : "On-chain rankings will appear after the voting contract is deployed."}
              </p>
              {error && (
                <button className="text-button" onClick={refresh}>
                  <Icon name="refresh" size={16} />
                  Refresh leaderboard
                </button>
              )}
            </div>
          )}
        </div>
        <p className="small muted board-note">
          <Icon name="clock" size={14} />
          Days close at 00:00 UTC. Equal scores favor the first wallet to reach
          them.
        </p>
      </div>
      <aside className="rewards-panel" aria-labelledby="rewards-heading">
        <div className="reward-art" aria-hidden="true">
          <Icon name="trophy" size={33} />
          <span className="reward-spark reward-spark-1">✧</span>
          <span className="reward-spark reward-spark-2">✧</span>
        </div>
        <h2 id="rewards-heading">Small paws. Sweet rewards.</h2>
        <p>Each day’s top 10 voters can claim a little Sepolia ETH.</p>
        <div className="reward-podium">
          <span>1st place</span>
          <strong className="number">0.001 ETH</strong>
        </div>
        <div className="reward-podium">
          <span>2nd place</span>
          <strong className="number">0.0009 ETH</strong>
        </div>
        <div className="reward-podium">
          <span>3rd place</span>
          <strong className="number">0.0008 ETH</strong>
        </div>
        <button
          className="text-button rewards-link"
          onClick={() => setShowRewards(true)}
        >
          See all 10 rewards
          <Icon name="arrow" size={16} />
        </button>
        <div className="claim-section">
          <div className="claim-summary">
            <span>
              {closed ? `${dayLabel(day)} reward` : "Your provisional reward"}
            </span>
            <strong>
              {contract && board && address
                ? `${formatEther(board.amount)} ETH`
                : "Not available"}
            </strong>
          </div>
          <button
            className="button reward-button full"
            onClick={claim}
            disabled={
              !contract ||
              !core ||
              !board ||
              !eligible ||
              underfunded ||
              busy ||
              (!!address && (chainId !== 11155111 || !wallet))
            }
          >
            {busy
              ? "Checking your claim…"
              : board?.claimed && closed
                ? "Reward claimed"
                : "Claim reward"}
            <Icon name={board?.claimed ? "check" : "wallet"} size={17} />
          </button>
          <p className="small">
            {!contract
              ? "Rewards open after deployment and funding."
              : !core
                ? "Verified story reads are paused. Retry the source before claiming."
                : address && chainId !== 11155111
                  ? "Switch to Sepolia with the wallet control to claim."
                  : address && !wallet
                    ? "Your wallet is preparing. Retry the wallet connection if needed."
                    : !address
                      ? "Connect your wallet to check your reward."
                      : board?.claimed && closed
                        ? "This day’s reward is already in your wallet."
                        : !closed
                          ? "Today’s ranks can change. Claim after 00:00 UTC."
                          : !board
                            ? "Refresh the leaderboard to check eligibility."
                            : !eligible
                              ? "This wallet did not finish in the top 10 for this day."
                              : underfunded
                                ? "The pool needs a top-up. Your claim will wait safely."
                                : "Your final rank is eligible. Gas is paid in Sepolia ETH."}
          </p>
          {contract && board && (
            <p className="small pool-balance">
              Pool balance: {formatEther(board.balance)} ETH
            </p>
          )}
        </div>
        {walletError && address && chainId === 11155111 && (
          <button className="text-button" onClick={() => void retryWallet()}>
            Retry wallet connection
          </button>
        )}
        <TransactionStatus tx={tx} recheck={recheck} />
      </aside>
      <Modal
        title="A little reward for every rank"
        open={showRewards}
        onClose={() => setShowRewards(false)}
      >
        <p className="muted">
          Final UTC-day ranks earn Sepolia test ETH. Claims are paid from the
          contract’s funded balance.
        </p>
        <ol className="reward-list">
          {Array.from({ length: 10 }, (_, i) => (
            <li key={i}>
              <span>Rank {i + 1}</span>
              <strong>{rewardForRank(i + 1)} ETH</strong>
            </li>
          ))}
        </ol>
        <p className="small muted">
          A full top-10 day uses 0.0055 ETH. If the pool is short, eligible
          claims wait for funding. Rewards do not expire.
        </p>
      </Modal>
    </section>
  );
}
