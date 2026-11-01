/** Disposable in-memory EVM fixtures. Never used as a public deployment or a signer. */
import ganache from "ganache";
import solc from "solc";
import fs from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  custom,
  parseEther,
} from "viem";
import { sepolia } from "viem/chains";
export const mockSource = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import "SqueekTales.sol";
contract MockCore is ISqueekCore {
    uint64 public genesis;
    uint64 public settled = 1;
    bool public isPaused;
    constructor(uint64 g) { genesis = g; }
    function configuration() external view returns (Configuration memory c) { c.genesisTimestamp=genesis;c.roundDuration=600;c.maxWorkPerRound=10000; }
    function state() external view returns (State memory s) { s.settledThroughRound=settled;s.cumulativeWork=120;s.paused=isPaused; }
    function implementationCodeVersion() external pure returns (uint64) { return 3; }
    function implementationCodeAddress() external view returns (address) { return address(this); }
    function setSettled(uint64 s) external { settled=s; }
    function setPaused(bool p) external { isPaused=p; }
    struct Position { uint64 cumulativeWork; uint96 cumulativeBlockUnits; uint32 workPerThousandBlocks; }
    struct Checkpoint { uint64 roundId; uint64 cumulativeWork; uint96 cumulativeBlockUnits; uint32 workPerThousandBlocks; bytes32 dataHash; }
    struct Page { uint64 certifiedThroughRound; Position start; Position end; Checkpoint[] rounds; }
    function roundPage(uint64 afterRound,uint64 throughRound,uint256) external view returns(Page memory p) {
      require(throughRound <= settled); p.certifiedThroughRound=throughRound;
      p.start.cumulativeWork=afterRound>=1?120:0;p.end.cumulativeWork=throughRound>=1?120:0;
      p.rounds=new Checkpoint[](afterRound==0 && throughRound>=1 ? 1 : 0);
      if(p.rounds.length>0)p.rounds[0]=Checkpoint(1,120,0,10000,bytes32(0));
    }
}
contract RejectingVoter {
    SqueekTales public tales;
    constructor(address t) { tales=SqueekTales(payable(t)); }
    function vote(uint64 r) external { tales.vote(r,0); }
    function claim(uint256 d) external { tales.claim(d); }
    receive() external payable { revert("no receive"); }
}
contract ReenteringVoter {
    SqueekTales public tales; uint256 public day; bool public blocked;
    constructor(address t) { tales=SqueekTales(payable(t)); }
    function vote(uint64 r) external { tales.vote(r,0); }
    function claim(uint256 d) external { day=d;tales.claim(d); }
    receive() external payable { try tales.claim(day) { revert("reentry accepted"); } catch { blocked=true; } }
}`;
export function compileFixtures() {
  const input = {
    language: "Solidity",
    sources: {
      "SqueekTales.sol": {
        content: fs.readFileSync("contracts/SqueekTales.sol", "utf8"),
      },
      "Mock.sol": { content: mockSource },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  const result = JSON.parse(solc.compile(JSON.stringify(input)));
  if (result.errors?.some((e) => e.severity === "error"))
    throw new Error(result.errors.map((e) => e.formattedMessage).join("\n"));
  return result.contracts;
}
export async function makeChain({
  time = new Date("2026-11-01T08:00:00Z"),
  funding = "0.0055",
  genesis,
} = {}) {
  const provider = ganache.provider({
    chain: { chainId: 11155111, time, hardfork: "shanghai" },
    wallet: { totalAccounts: 16, defaultBalance: 100 },
    miner: { blockGasLimit: 30_000_000 },
    logging: { quiet: true },
  });
  const normalized = {
    request: async (args) => {
      try {
        return await provider.request(args);
      } catch (e) {
        if (e.data && /revert/i.test(e.message)) {
          e.code = 3;
        }
        throw e;
      }
    },
  };
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: custom(normalized),
    cacheTime: 0,
    pollingInterval: 50,
  });
  const wallet = createWalletClient({
    chain: sepolia,
    transport: custom(provider),
  });
  const accounts = await wallet.getAddresses();
  const compiled = compileFixtures();
  const coreArtifact = compiled["Mock.sol"].MockCore;
  const talesArtifact = JSON.parse(
    fs.readFileSync("src/generated/SqueekTales.json", "utf8"),
  );
  async function deploy(artifact, args = [], value = 0n) {
    const hash = await wallet.deployContract({
      account: accounts[0],
      abi: artifact.abi,
      bytecode: artifact.bytecode ?? `0x${artifact.evm.bytecode.object}`,
      args,
      value,
      gas: 8_000_000n,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success" || !receipt.contractAddress)
      throw new Error("Fixture deployment failed");
    return receipt.contractAddress;
  }
  const start = BigInt(
    genesis ?? Math.floor(time.getTime() / 86_400_000) * 86_400 - 86_400,
  );
  const core = await deploy(coreArtifact, [start]);
  const tales = await deploy(talesArtifact, [core], parseEther(funding));
  const read = (functionName, args = []) =>
    publicClient.readContract({
      address: tales,
      abi: talesArtifact.abi,
      functionName,
      args,
    });
  const send = async (functionName, args = [], account = accounts[0]) => {
    const { request } = await publicClient.simulateContract({
      address: tales,
      abi: talesArtifact.abi,
      functionName,
      args,
      account,
    });
    const hash = await wallet.writeContract({ ...request, gas: 1_500_000n });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success")
      throw new Error("Fixture transaction reverted");
    return receipt;
  };
  const setTime = async (date) => {
    await provider.request({
      method: "evm_setTime",
      params: [new Date(date).getTime()],
    });
    await provider.request({ method: "evm_mine", params: [] });
  };
  const coreWrite = async (functionName, args) => {
    const hash = await wallet.writeContract({
      account: accounts[0],
      address: core,
      abi: coreArtifact.abi,
      functionName,
      args,
      gas: 1_500_000n,
    });
    return publicClient.waitForTransactionReceipt({ hash });
  };
  return {
    provider,
    publicClient,
    wallet,
    accounts,
    core,
    tales,
    coreArtifact,
    talesArtifact,
    compiled,
    start,
    read,
    send,
    setTime,
    deploy,
    coreWrite,
  };
}
