import { getAddress, isAddress, keccak256, type Abi, type Address } from "viem";
import { API, publicClient } from "./config";
import coreAbiJson from "./core-abi.json";
import tales from "../generated/SqueekTales.json";
import type { Round } from "./story";
export const coreAbi = coreAbiJson as Abi;
export const talesAbi = tales.abi as Abi;
export type CoreSnapshot = {
  core: Address;
  genesis: bigint;
  duration: bigint;
  settled: bigint;
  paused: boolean;
  rounds: Round[];
  safeBlock: bigint;
  generatedAt: number;
  now: bigint;
  currentRound: bigint;
};
type CoreState = {
  settledThroughRound: bigint;
  cumulativeWork: bigint;
  paused: boolean;
};
type CoreConfig = { genesisTimestamp: bigint; roundDuration: bigint };
type RoundPage = {
  certifiedThroughRound: bigint;
  start: { cumulativeWork: bigint };
  rounds: { roundId: bigint; cumulativeWork: bigint }[];
};

export async function loadCore(): Promise<CoreSnapshot> {
  const response = await fetch(`${API}/core`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(
      "Squeekchain is unavailable. Retry to check settled rounds.",
    );
  const data = await response.json();
  if (
    data.status !== "available" ||
    String(data.chain?.chainId) !== "11155111" ||
    !isAddress(data.identities?.core ?? "") ||
    !/^\d+$/.test(data.chain?.safeThroughBlock ?? "")
  )
    throw new Error(
      "Settled data is unavailable. The story is waiting safely.",
    );
  const address = getAddress(data.identities.core);
  const blockNumber = BigInt(data.chain.safeThroughBlock);
  const read = (functionName: string) =>
    publicClient.readContract({
      address,
      abi: coreAbi,
      functionName,
      blockNumber,
    });
  const [rawState, rawConfig, version, implementation, head] =
    await Promise.all([
      read("state"),
      read("configuration"),
      read("implementationCodeVersion"),
      read("implementationCodeAddress"),
      publicClient.getBlock(),
    ]);
  const state = rawState as CoreState;
  const configuration = rawConfig as CoreConfig;
  if (
    version !== 3n ||
    configuration.roundDuration !== 600n ||
    configuration.genesisTimestamp <= 0n ||
    String(state.settledThroughRound) !== data.core?.settledThroughRound ||
    String(configuration.genesisTimestamp) !==
      data.configuration?.genesisTimestamp ||
    String(implementation).toLowerCase() !==
      String(data.identities.proxyImplementation).toLowerCase()
  )
    throw new Error(
      "Squeekchain deployment changed. Story updates are paused until the data matches.",
    );
  const code = await publicClient.getCode({
    address: implementation as Address,
    blockNumber,
  });
  if (
    !code ||
    keccak256(code).toLowerCase() !==
      String(data.implementation?.runtimeHash).toLowerCase()
  )
    throw new Error(
      "Core verification failed. Retry after the source is updated.",
    );
  const settled = state.settledThroughRound;
  const afterRound = settled > 12n ? settled - 12n : 0n;
  const page = (await publicClient.readContract({
    address,
    abi: coreAbi,
    functionName: "roundPage",
    args: [afterRound, settled, 16n],
    blockNumber,
  })) as RoundPage;
  if (page.certifiedThroughRound !== settled)
    throw new Error("History is still catching up. Retry in a moment.");
  const rounds = expandRounds(page, afterRound);
  return {
    core: address,
    genesis: configuration.genesisTimestamp,
    duration: configuration.roundDuration,
    settled,
    paused: state.paused,
    rounds: rounds.reverse(),
    safeBlock: blockNumber,
    generatedAt: Date.now(),
    now: head.timestamp,
    currentRound:
      head.timestamp < configuration.genesisTimestamp
        ? 0n
        : (head.timestamp - configuration.genesisTimestamp) / 600n + 1n,
  };
}

/** Omitted rounds are zero only inside the certified frontier. Never infer from wall time. */
export function expandRounds(page: RoundPage, after: bigint): Round[] {
  const result: Round[] = [];
  let cumulative = page.start.cumulativeWork;
  let index = 0;
  for (let id = after + 1n; id <= page.certifiedThroughRound; id++) {
    const active = page.rounds[index];
    if (active?.roundId === id) {
      if (active.cumulativeWork < cumulative)
        throw new Error("Invalid settled history.");
      result.push({ id, work: active.cumulativeWork - cumulative });
      cumulative = active.cumulativeWork;
      index++;
    } else result.push({ id, work: 0n });
  }
  return result;
}

export async function loadDeployment(): Promise<Address | null> {
  const response = await fetch(new URL("deployment.json", document.baseURI), {
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error("Contract configuration could not load. Retry the page.");
  const data = await response.json();
  if (data.contractAddress === null) return null;
  if (data.chainId !== 11155111 || !isAddress(data.contractAddress))
    throw new Error("Invalid deployment configuration.");
  return getAddress(data.contractAddress);
}
export async function verifyTales(address: Address, core: Address) {
  const [code, version, actualCore, genesis, duration, config] =
    await Promise.all([
      publicClient.getCode({ address }),
      publicClient.readContract({
        address,
        abi: talesAbi,
        functionName: "VERSION",
      }),
      publicClient.readContract({
        address,
        abi: talesAbi,
        functionName: "core",
      }),
      publicClient.readContract({
        address,
        abi: talesAbi,
        functionName: "genesisTimestamp",
      }),
      publicClient.readContract({
        address,
        abi: talesAbi,
        functionName: "roundDuration",
      }),
      publicClient.readContract({
        address: core,
        abi: coreAbi,
        functionName: "configuration",
      }),
    ]);
  if (
    genesis !== (config as CoreConfig).genesisTimestamp ||
    duration !== (config as CoreConfig).roundDuration
  )
    throw new Error("Voting round configuration does not match Squeekchain.");
  if (
    !code ||
    version !== 2n ||
    String(actualCore).toLowerCase() !== core.toLowerCase()
  )
    throw new Error(
      "This voting contract does not match the current Squeekchain core.",
    );
  // Match the compiled runtime after replacing only the compiler's immutable slots.
  const expected = tales.deployedBytecode.slice(2);
  const actual = code.slice(2);
  if (expected.length !== actual.length)
    throw new Error("Voting contract bytecode does not match this release.");
  const refs = (
    tales as {
      immutableReferences?: Record<string, { start: number; length: number }[]>;
    }
  ).immutableReferences;
  if (refs) {
    const mask = new Set(
      Object.values(refs).flatMap((r) =>
        r.flatMap(({ start, length }) =>
          Array.from({ length: length * 2 }, (_, i) => start * 2 + i),
        ),
      ),
    );
    for (let i = 0; i < expected.length; i++)
      if (!mask.has(i) && actual[i] !== expected[i])
        throw new Error(
          "Voting contract bytecode does not match this release.",
        );
  } else if (expected !== actual)
    throw new Error(
      "Voting contract verification is unavailable. Recompile this release.",
    );
  return true;
}

export type Board = {
  rows: { voter: Address; votes: number }[];
  balance: bigint;
  score: number;
  rank: number;
  amount: bigint;
  claimed: boolean;
  vote: number;
  tallies: number[];
  currentRound: bigint;
  timestamp: bigint;
};
export async function loadBoard(
  address: Address,
  core: Address,
  day: number,
  voter?: Address,
): Promise<Board> {
  await verifyTales(address, core);
  const block = await publicClient.getBlock();
  const read = (functionName: string, args: unknown[] = []) =>
    publicClient.readContract({
      address,
      abi: talesAbi,
      functionName,
      args,
      blockNumber: block.number,
    });
  const currentRound = (await read("currentRound")) as bigint;
  const [board, balance, score, reward, claimed, vote, tallies] =
    await Promise.all([
      read("leaderboard", [BigInt(day)]),
      publicClient.getBalance({ address, blockNumber: block.number }),
      voter ? read("dailyVotes", [BigInt(day), voter]) : 0,
      voter ? read("rewardFor", [BigInt(day), voter]) : [0, 0n],
      voter ? read("claimed", [BigInt(day), voter]) : false,
      voter ? read("voteOf", [currentRound, voter]) : 0,
      read("roundVotes", [currentRound]),
    ]);
  const [leaders, count] = board as [
    { voter: Address; votes: number }[],
    number,
  ];
  const [rank, amount] = reward as [number, bigint];
  return {
    rows: leaders.slice(0, Number(count)),
    balance,
    score: Number(score),
    rank: Number(rank),
    amount,
    claimed: Boolean(claimed),
    vote: Number(vote),
    tallies: (tallies as number[]).map(Number),
    currentRound,
    timestamp: block.timestamp,
  };
}
export function friendlyError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/reject|denied|4001/i.test(text))
    return "Request declined in your wallet. You can try again.";
  if (/insufficient funds/i.test(text))
    return "Your wallet needs Sepolia ETH for the transaction and gas. Add test ETH, then try again.";
  if (/AlreadyVoted/.test(text))
    return "This wallet already voted this round. Come back for the next round.";
  if (/PoolUnderfunded/.test(text))
    return "The reward pool needs funding. Your reward stays claimable once it is topped up.";
  if (/RoundNotOpen/.test(text))
    return "The round changed or settlement is paused. Refresh and choose again.";
  if (/DayNotClosed/.test(text))
    return "Rewards unlock after this UTC day ends.";
  if (/chain|network/i.test(text))
    return "Switch your wallet to Sepolia and try again.";
  return "The request could not finish. Check your connection, then retry.";
}
