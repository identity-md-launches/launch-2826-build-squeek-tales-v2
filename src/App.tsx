import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { getAddress, isAddress, type Address } from "viem";
import { loadCore, loadDeployment, loadBoard, talesAbi } from "./lib/data";
import { publicClient, explorerAddress } from "./lib/config";
import {
  chapterFor,
  INTRO,
  PATHS,
  moodFor,
  utcDay,
  type Branch,
  type Round,
} from "./lib/story";
import { WalletControl } from "./components/Wallet";
import { VotePanel } from "./components/VotePanel";
import { Leaderboard } from "./components/Leaderboard";
import { Setup } from "./components/Setup";
import { Modal } from "./components/Modal";
import { Icon } from "./components/Icon";

function readOverride(): Address | null {
  try {
    const stored = localStorage.getItem("squeek.contract.v2");
    if (stored && isAddress(stored)) return getAddress(stored);
  } catch {
    /* storage is optional */
  }
  return null;
}
export default function App() {
  const { address } = useAccount();
  const queries = useQueryClient();
  const [mode, setMode] = useState<"live" | "practice">("live");
  const [selected, setSelected] = useState<Branch>(0);
  const [day, setDay] = useState(utcDay());
  const [override, setOverride] = useState<Address | null>(readOverride);
  const [helpOpen, setHelpOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(location.hash === "#setup");
  const [selectedRound, setSelectedRound] = useState<bigint | null>(null);
  const [practice, setPractice] = useState<{ round: Round; branch: Branch }[]>(
    [],
  );
  const [tick, setTick] = useState(Date.now());
  const core = useQuery({
    queryKey: ["core"],
    queryFn: loadCore,
    refetchInterval: 15_000,
    retry: 1,
    staleTime: 10_000,
  });
  const deployment = useQuery({
    queryKey: ["deployment"],
    queryFn: loadDeployment,
    staleTime: Infinity,
    retry: 1,
  });
  const contract = override ?? deployment.data ?? null;
  const board = useQuery({
    queryKey: ["board", contract, core.data?.core, day, address],
    queryFn: () => loadBoard(contract!, core.data!.core, day, address),
    enabled: !!contract && !!core.data,
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 1,
  });
  const branches = useQuery({
    queryKey: ["branches", contract, core.data?.settled.toString()],
    queryFn: async () => {
      const result = await Promise.all(
        core.data!.rounds.map(async (round) => {
          const [branch] = (await publicClient.readContract({
            address: contract!,
            abi: talesAbi,
            functionName: "winningBranch",
            args: [round.id],
          })) as [number, number];
          return [round.id.toString(), Number(branch)] as const;
        }),
      );
      return Object.fromEntries(result) as Record<string, Branch>;
    },
    enabled: !!contract && !!core.data && !!board.data,
    staleTime: 60_000,
    retry: 1,
  });
  useEffect(() => {
    const interval = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    const onHash = () => {
      if (location.hash === "#setup") setSetupOpen(true);
    };
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (selectedRound && !core.data?.rounds.some((r) => r.id === selectedRound))
      setSelectedRound(null);
  }, [core.data, selectedRound]);
  const latestRound =
    core.data?.rounds.find((r) => r.id === selectedRound) ??
    core.data?.rounds[0];
  const currentPractice = practice.at(-1);
  const displayed =
    mode === "practice"
      ? currentPractice
        ? chapterFor(currentPractice.round, currentPractice.branch)
        : INTRO
      : latestRound
        ? contract && !branches.data
          ? {
              title: "The next page is waiting",
              text: "This round has settled. Its chosen path is still being verified. Refresh the voting data to continue.",
              place: "Story pending",
            }
          : chapterFor(
              latestRound,
              contract ? (branches.data?.[latestRound.id.toString()] ?? 0) : 2,
            )
        : INTRO;
  const mood =
    mode === "practice"
      ? currentPractice
        ? moodFor(currentPractice.round.work)
        : null
      : latestRound
        ? moodFor(latestRound.work)
        : null;
  const elapsedSinceRead = core.data
    ? (tick - core.data.generatedAt) / 1000
    : 0;
  const chainNow = core.data
    ? Number(core.data.now) + elapsedSinceRead
    : tick / 1000;
  const currentRound = core.data
    ? Math.max(0, Math.floor((chainNow - Number(core.data.genesis)) / 600) + 1)
    : 0;
  const secondsLeft = core.data
    ? Math.max(
        0,
        Math.ceil(Number(core.data.genesis) + currentRound * 600 - chainNow),
      )
    : 0;
  const timer = `${Math.floor(secondsLeft / 60)
    .toString()
    .padStart(2, "0")}:${(secondsLeft % 60).toString().padStart(2, "0")}`;
  const isStale =
    !!core.data && (!!core.error || tick - core.data.generatedAt > 60_000);
  function refresh() {
    void queries.invalidateQueries({ queryKey: ["board"] });
    void queries.invalidateQueries({ queryKey: ["core"] });
    void queries.invalidateQueries({ queryKey: ["branches"] });
  }
  function adopt(value: Address | null) {
    setOverride(value);
    try {
      if (value) localStorage.setItem("squeek.contract.v2", value);
      else localStorage.removeItem("squeek.contract.v2");
    } catch {
      /* session selection still works */
    }
    refresh();
  }
  function takePath() {
    const id = BigInt(practice.length + 1);
    // Deliberately authored practice sequence, not simulated chain telemetry.
    const work = [120n, 850n, 0n][practice.length % 3];
    setPractice([...practice, { round: { id, work }, branch: selected }]);
    setMode("practice");
    setSelectedRound(null);
  }
  const roundLabel =
    mode === "practice"
      ? "Practice adventure"
      : core.isPending
        ? "Reading Squeekchain…"
        : isStale
          ? "Round updates paused"
          : core.data?.paused
            ? "Settlement paused"
            : core.data
              ? `Round ${currentRound.toLocaleString()} is open`
              : "Waiting for Squeekchain";
  return (
    <>
      <a className="skip-link" href="#story">
        Skip to the story
      </a>
      <header className="site-header">
        <a className="brand" href="#story" onClick={() => setMode("live")}>
          <img src="./favicon.svg" width="37" height="37" alt="" />
          <span>
            Squeek Tales<span className="version">v2</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#story" className="nav-link current">
            The story
          </a>
          <a className="nav-link" href="#leaderboard">
            Leaderboard
          </a>
          <button className="nav-link" onClick={() => setHelpOpen(true)}>
            How to play
          </button>
        </nav>
        <div className="header-utilities">
          <span className="network-label">
            <span className="status-dot" />
            Sepolia
          </span>
          <WalletControl />
        </div>
      </header>
      <main>
        <section className="intro" aria-labelledby="page-title">
          <div>
            <h1 id="page-title">Little paws. Big adventures.</h1>
            <p>A living hamster story, written together.</p>
          </div>
          <div className="story-mode" role="group" aria-label="Story mode">
            <button
              className={mode === "live" ? "active" : ""}
              aria-pressed={mode === "live"}
              onClick={() => setMode("live")}
            >
              <span className="status-dot" />
              Live story
            </button>
            <button
              className={mode === "practice" ? "active" : ""}
              aria-pressed={mode === "practice"}
              onClick={() => setMode("practice")}
            >
              Practice
            </button>
          </div>
        </section>
        <div id="story" className="game-grid">
          <article className="story-panel" aria-labelledby="chapter-heading">
            <div className="story-scene">
              <img
                src="./hamster-glade.svg"
                width="1000"
                height="590"
                alt="Squeek, a tiny hamster with a red scarf and a map, at a woodland crossroads."
                fetchPriority="high"
              />
              <span className="location-tag">
                <Icon name="leaf" size={15} />
                {displayed.place}
              </span>
              <button
                className="journal-button"
                onClick={() => setJournalOpen(true)}
                aria-label="Read the story journal"
              >
                <Icon name="book" size={18} />
                <span>Story journal</span>
              </button>
            </div>
            <div className="chapter-content">
              <div className="chapter-meta">
                <span>
                  {mode === "practice"
                    ? `Practice chapter ${practice.length || 1}`
                    : latestRound
                      ? `Chapter ${latestRound.id.toLocaleString()}`
                      : "The adventure begins"}
                </span>
                <span className={`mood-label ${mood?.toLowerCase() ?? ""}`}>
                  <Icon
                    name={
                      mood === "Nap"
                        ? "moon"
                        : mood === "Zoomies"
                          ? "bolt"
                          : "leaf"
                    }
                    size={14}
                  />
                  {mood ??
                    (mode === "practice"
                      ? "Your imagination"
                      : "Settled rounds only")}
                </span>
              </div>
              <h2 id="chapter-heading">{displayed.title}</h2>
              <p
                className="story-prose"
                key={`${mode}-${latestRound?.id}-${practice.length}`}
              >
                {displayed.text}
              </p>
              {selectedRound && mode === "live" && (
                <button
                  className="text-button"
                  onClick={() => setSelectedRound(null)}
                >
                  Return to the latest chapter
                  <Icon name="arrow" size={16} />
                </button>
              )}
              {mode === "live" && latestRound && (
                <div className="chapter-proof small muted">
                  <Icon name="check" size={14} />
                  <span>
                    Settled round {latestRound.id.toString()} ·{" "}
                    {latestRound.work.toLocaleString()} work units
                  </span>
                  <button
                    className="text-button small"
                    onClick={() => setHelpOpen(true)}
                  >
                    How it works
                    <Icon name="info" size={14} />
                  </button>
                </div>
              )}
            </div>
          </article>
          <div className="game-sidebar">
            <div className="round-status">
              <div className="round-status-line">
                <span className="inline">
                  <span
                    className={`status-dot ${isStale || core.isError ? "paused" : ""}`}
                  />
                  {roundLabel}
                </span>
                {core.data && !isStale && mode === "live" && (
                  <span className="countdown">
                    <Icon name="clock" size={14} />
                    {timer}
                  </span>
                )}
              </div>
              <div
                className="round-track"
                role="progressbar"
                aria-label="Measurement round elapsed"
                aria-valuemin={0}
                aria-valuemax={600}
                aria-valuenow={
                  core.data ? Math.max(0, Math.min(600, 600 - secondsLeft)) : 0
                }
              >
                <span
                  style={{
                    width: `${core.data ? Math.max(0, Math.min(100, (600 - secondsLeft) / 6)) : 0}%`,
                  }}
                />
              </div>
              <p className="small muted">
                {mode === "practice"
                  ? "Choose a path to turn the page."
                  : core.data?.paused
                    ? "Core settlement is paused. Chapters will wait."
                    : "A new chapter after settlement, every 10-minute round."}
              </p>
            </div>
            <VotePanel
              key={`${address}-${contract}`}
              mode={mode}
              selected={selected}
              setSelected={setSelected}
              onPractice={takePath}
              core={isStale ? undefined : core.data}
              contract={contract}
              board={board.error ? undefined : board.data}
              refresh={refresh}
              loading={!!contract && (core.isPending || board.isPending)}
            />
          </div>
        </div>
        <div className="story-notices" role="status">
          {mode === "practice" ? (
            <div className="notice practice-notice">
              <Icon name="book" size={18} />
              <span>
                This is your practice story. Choices stay in this session; they
                do not count toward rewards.
              </span>
              <button className="text-button" onClick={() => setMode("live")}>
                Back to live
                <Icon name="arrow" size={15} />
              </button>
            </div>
          ) : core.error ? (
            <div className="notice">
              <Icon name="info" size={18} />
              <span>
                {core.data
                  ? "Story updates are paused. The last verified chapter stays here."
                  : "Settled rounds could not be verified. You can still try a practice adventure."}
              </span>
              <button
                className="text-button"
                onClick={() => void core.refetch()}
                disabled={core.isFetching}
              >
                <Icon name="refresh" size={15} />
                {core.isFetching ? "Checking…" : "Retry source"}
              </button>
            </div>
          ) : null}
          {!contract && (
            <div className="notice deployment-notice">
              <Icon name="seed" size={18} />
              <span>
                The live story is here. On-chain votes and rewards await a
                funded Sepolia deployment.
              </span>
              <button
                className="text-button"
                onClick={() => setSetupOpen(true)}
              >
                Set up voting
                <Icon name="arrow" size={15} />
              </button>
            </div>
          )}
          {deployment.isError && (
            <div className="notice">
              <Icon name="info" size={18} />
              <span>Voting configuration could not load.</span>
              <button
                className="text-button"
                onClick={() => void deployment.refetch()}
              >
                Retry configuration
              </button>
            </div>
          )}
          {branches.isError && contract && (
            <div className="notice">
              <Icon name="info" size={18} />
              <span>
                The round is settled, but its path votes could not be read.
              </span>
              <button
                className="text-button"
                onClick={() => void branches.refetch()}
              >
                Retry chosen path
              </button>
            </div>
          )}
          {board.error && (
            <div className="notice">
              <Icon name="info" size={18} />
              <span>
                The selected voting contract could not be verified. Votes and
                claims are paused.
              </span>
              <button className="text-button" onClick={refresh}>
                Retry
              </button>
              <button
                className="text-button"
                onClick={() => setSetupOpen(true)}
              >
                Check setup
              </button>
            </div>
          )}
        </div>
        <Leaderboard
          key={`board-${address}-${contract}`}
          day={day}
          setDay={setDay}
          board={board.error ? undefined : board.data}
          contract={contract}
          core={isStale ? undefined : core.data}
          refresh={refresh}
          loading={!!contract && board.isPending}
          error={board.error ? "Unavailable" : null}
        />
        <section className="story-explainer" aria-label="How the story grows">
          <div className="explainer-icon">
            <Icon name="leaf" size={28} />
          </div>
          <div>
            <h2>The wheel turns the page.</h2>
            <p>
              Squeekchain settles the wheel’s work. We turn each round into a
              story: Nap, Jog, or Zoomies. Your votes choose where Squeek goes
              next.
            </p>
          </div>
          <button className="text-button" onClick={() => setHelpOpen(true)}>
            Meet the story
            <Icon name="arrow" size={16} />
          </button>
        </section>
      </main>
      <footer className="site-footer">
        <a href="#story" className="footer-brand">
          <img src="./favicon.svg" width="24" height="24" alt="" />
          Made for little adventures.
        </a>
        <div>
          <a
            href="https://docs.squeekchain.com/developers/core/"
            target="_blank"
            rel="noreferrer"
          >
            Powered by Squeekchain
            <Icon name="external" size={13} />
          </a>
          <button onClick={() => setSetupOpen(true)}>Contract & setup</button>
          <span>Sepolia testnet · Test ETH only</span>
        </div>
      </footer>
      <Modal
        title="Every round, a little adventure"
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        className="help-modal"
      >
        <ol className="how-list">
          <li>
            <span>1</span>
            <div>
              <h3>Read the latest chapter</h3>
              <p>
                Only certified Squeekchain rounds turn the page. Zero settled
                work is Nap; 1–599 work units is Jog; 600 or more is Zoomies.
                These are this game’s story rules.
              </p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <h3>Choose a path together</h3>
              <p>
                Connect on Sepolia and cast one vote per wallet in the open
                measurement round. The most-voted path becomes that round’s
                chapter once it settles. Ties favor the first path. Until
                deployment, chapters follow Cloverwood.
              </p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <h3>Leave a little pawprint</h3>
              <p>
                Votes count toward the UTC day when they are mined. The top 10
                wallets can claim rewards after midnight UTC. Equal scores favor
                the first to reach them. Multiple wallets are not prevented.
              </p>
            </div>
          </li>
        </ol>
        <p className="small muted">
          A round ending is not a settlement. During a delay, the story waits.
          The journal shows the latest 12 certified rounds, including every
          zero-work round in that span.
        </p>
        <p className="small muted">
          Practice is local play with an authored Nap / Jog / Zoomies sequence.
          It sends no transactions and earns no rewards.
        </p>
        <a
          className="text-button"
          href="https://docs.squeekchain.com/system/rounds-and-blocks/"
          target="_blank"
          rel="noreferrer"
        >
          Read about Squeekchain rounds
          <Icon name="external" size={15} />
        </a>
      </Modal>
      <Modal
        title="Squeek’s story journal"
        open={journalOpen}
        onClose={() => setJournalOpen(false)}
        className="journal-modal"
      >
        <p className="muted">
          {mode === "practice"
            ? "Your practice chapters from this session."
            : "The latest 12 settled chapters. Every certified round is a page."}
        </p>
        <div className="journal-list">
          {mode === "practice" ? (
            practice.length ? (
              [...practice].reverse().map((item) => (
                <div className="journal-entry" key={item.round.id.toString()}>
                  <span className="journal-round">
                    {item.round.id.toString()}
                  </span>
                  <span>
                    <strong>{chapterFor(item.round, item.branch).title}</strong>
                    <span className="small muted">
                      Practice · {moodFor(item.round.work)} ·{" "}
                      {PATHS[item.branch].place}
                    </span>
                  </span>
                  <Icon name="book" size={18} />
                </div>
              ))
            ) : (
              <p>Choose a path to write your first practice chapter.</p>
            )
          ) : core.data?.rounds.length ? (
            core.data.rounds.map((round) => (
              <button
                key={round.id.toString()}
                className="journal-entry"
                onClick={() => {
                  setSelectedRound(round.id);
                  setJournalOpen(false);
                  document
                    .getElementById("story")
                    ?.scrollIntoView({ behavior: "instant" });
                }}
              >
                <span className="journal-round">{round.id.toString()}</span>
                <span>
                  <strong>
                    {contract && !branches.data
                      ? `Settled chapter ${round.id}`
                      : chapterFor(
                          round,
                          contract
                            ? (branches.data?.[round.id.toString()] ?? 0)
                            : 2,
                        ).title}
                  </strong>
                  <span className="small muted">
                    {moodFor(round.work)} · {round.work.toString()} settled work
                    units
                  </span>
                </span>
                <Icon name="chevron" size={18} />
              </button>
            ))
          ) : (
            <p>
              Verified chapters will appear when Squeekchain is available. Try a
              practice path while you wait.
            </p>
          )}
        </div>
        {core.data && mode === "live" && (
          <p className="small muted">
            Read at Sepolia block {core.data.safeBlock.toString()}.{" "}
            <a
              href={explorerAddress(core.data.core)}
              target="_blank"
              rel="noreferrer"
            >
              View the source contract
            </a>
            .
          </p>
        )}
      </Modal>
      <Setup
        key={`setup-${address}`}
        open={setupOpen}
        onClose={() => {
          setSetupOpen(false);
          if (location.hash === "#setup")
            history.replaceState(null, "", location.pathname + location.search);
        }}
        core={core.data}
        contract={contract}
        onAdopt={adopt}
      />
    </>
  );
}
