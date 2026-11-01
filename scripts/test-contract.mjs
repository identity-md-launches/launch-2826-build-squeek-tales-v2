import assert from "node:assert/strict";
import { parseEther } from "viem";
import { makeChain } from "./test-chain.mjs";
const c = await makeChain();
let checks = 0;
async function check(name, fn) {
  await fn();
  checks++;
  console.log(`PASS ${name}`);
}
try {
  const day = Math.floor(
    new Date("2026-11-01T08:00:00Z").getTime() / 86_400_000,
  );
  let round = await c.read("currentRound");
  await check("funded pool equals the full daily schedule", async () =>
    assert.equal(
      await c.publicClient.getBalance({ address: c.tales }),
      parseEther("0.0055"),
    ),
  );
  await check("invalid branch and non-current rounds revert", async () => {
    await assert.rejects(c.send("vote", [round, 3]), /InvalidBranch/);
    await assert.rejects(c.send("vote", [round + 1n, 0]), /RoundNotOpen/);
    await assert.rejects(c.send("vote", [1n, 0]), /RoundNotOpen/);
  });
  await check("one recorded vote per wallet per round", async () => {
    await c.send("vote", [round, 1]);
    assert.equal(await c.read("voteOf", [round, c.accounts[0]]), 2);
    await assert.rejects(c.send("vote", [round, 2]), /AlreadyVoted/);
    assert.deepEqual(await c.read("roundVotes", [round]), [0, 1, 0]);
  });
  await check(
    "closed-day claim requirement",
    async () =>
      await assert.rejects(c.send("claim", [BigInt(day)]), /DayNotClosed/),
  );
  await check("settled-only branch results", async () => {
    await assert.rejects(c.read("winningBranch", [round]), /NotSettled/);
    assert.deepEqual(await c.read("winningBranch", [1n]), [0, 0]);
  });
  await check("first ten wallets win equal-score ties", async () => {
    for (let i = 1; i < 12; i++)
      await c.send("vote", [round, i % 3], c.accounts[i]);
    const [board, count] = await c.read("leaderboard", [BigInt(day)]);
    assert.equal(count, 10);
    assert.deepEqual(
      board.map((x) => x.voter.toLowerCase()),
      c.accounts.slice(0, 10).map((x) => x.toLowerCase()),
    );
  });
  await check(
    "higher counts promote and tied scores retain first reached",
    async () => {
      await c.setTime("2026-11-01T08:10:00Z");
      round = await c.read("currentRound");
      for (const i of [11, 9, 0])
        await c.send("vote", [round, 2], c.accounts[i]);
      const [board] = await c.read("leaderboard", [BigInt(day)]);
      assert.deepEqual(
        board.slice(0, 3).map((x) => x.voter.toLowerCase()),
        [11, 9, 0].map((i) => c.accounts[i].toLowerCase()),
      );
      assert.equal(board[0].votes, 2);
    },
  );
  await check(
    "rank model matches 12 more rounds with displaced candidates",
    async () => {
      const scores = new Map(
        c.accounts.map((a, i) => [a.toLowerCase(), i < 12 ? 1 : 0]),
      );
      const order = new Map();
      let sequence = 0;
      for (let i = 0; i < 12; i++)
        order.set(c.accounts[i].toLowerCase(), ++sequence);
      for (const i of [11, 9, 0]) {
        scores.set(c.accounts[i].toLowerCase(), 2);
        order.set(c.accounts[i].toLowerCase(), ++sequence);
      }
      for (let n = 1; n <= 12; n++) {
        await c.setTime(
          new Date(Date.parse("2026-11-01T08:10:00Z") + n * 600_000),
        );
        round = await c.read("currentRound");
        for (let i = 0; i < 16; i++)
          if ((i * 7 + n * 3) % 5 < 2) {
            await c.send("vote", [round, (i + n) % 3], c.accounts[i]);
            const a = c.accounts[i].toLowerCase();
            scores.set(a, scores.get(a) + 1);
            order.set(a, ++sequence);
          }
        const expected = [...scores.keys()]
          .filter((a) => scores.get(a) > 0)
          .sort(
            (a, b) =>
              scores.get(b) - scores.get(a) || order.get(a) - order.get(b),
          )
          .slice(0, 10);
        const [board] = await c.read("leaderboard", [BigInt(day)]);
        assert.deepEqual(
          board.map((x) => x.voter.toLowerCase()),
          expected,
        );
      }
    },
  );
  await check("paused settlement blocks new votes", async () => {
    await c.coreWrite("setPaused", [true]);
    await assert.rejects(
      c.send("vote", [round, 0], c.accounts[15]),
      /RoundNotOpen/,
    );
    await c.coreWrite("setPaused", [false]);
  });
  await check("settling freezes a voted branch", async () => {
    await c.coreWrite("setSettled", [round]);
    const votes = await c.read("roundVotes", [round]);
    const [winner, total] = await c.read("winningBranch", [round]);
    assert.equal(votes[winner], Math.max(...votes));
    assert.equal(
      total,
      votes.reduce((a, b) => a + b),
    );
    await assert.rejects(
      c.send("vote", [round, 0], c.accounts[15]),
      /RoundNotOpen/,
    );
  });
  await c.setTime("2026-11-02T00:00:01Z");
  await check("UTC rollover creates an independent leaderboard", async () => {
    const [, count] = await c.read("leaderboard", [BigInt(day + 1)]);
    assert.equal(count, 0);
    await c.send("vote", [await c.read("currentRound"), 0]);
    assert.equal(
      await c.read("dailyVotes", [BigInt(day + 1), c.accounts[0]]),
      1,
    );
  });
  const [finalBoard] = await c.read("leaderboard", [BigInt(day)]);
  await check(
    "all ten exact rewards can be claimed once, summing to 0.0055 ETH",
    async () => {
      let sum = 0n;
      for (let i = 0; i < 10; i++) {
        const voter = finalBoard[i].voter;
        const [rank, amount] = await c.read("rewardFor", [BigInt(day), voter]);
        assert.equal(rank, i + 1);
        assert.equal(amount, BigInt(10 - i) * parseEther("0.0001"));
        sum += amount;
        const before = await c.publicClient.getBalance({ address: c.tales });
        await c.send("claim", [BigInt(day)], voter);
        assert.equal(
          await c.publicClient.getBalance({ address: c.tales }),
          before - amount,
        );
        assert.equal(await c.read("claimed", [BigInt(day), voter]), true);
        await assert.rejects(
          c.send("claim", [BigInt(day)], voter),
          /AlreadyClaimed/,
        );
      }
      assert.equal(sum, parseEther("0.0055"));
      assert.equal(await c.publicClient.getBalance({ address: c.tales }), 0n);
    },
  );
  await check("unranked wallets cannot claim", async () => {
    const unranked = c.accounts.find(
      (a) => !finalBoard.some((x) => x.voter.toLowerCase() === a.toLowerCase()),
    );
    await assert.rejects(
      c.send("claim", [BigInt(day)], unranked),
      /NotEligible/,
    );
  });
  await check(
    "underfunded claims preserve entitlement until topped up",
    async () => {
      await c.setTime("2026-11-03T00:00:01Z");
      await assert.rejects(
        c.send("claim", [BigInt(day + 1)]),
        /PoolUnderfunded/,
      );
      assert.equal(
        await c.read("claimed", [BigInt(day + 1), c.accounts[0]]),
        false,
      );
      const hash = await c.wallet.sendTransaction({
        account: c.accounts[1],
        to: c.tales,
        value: parseEther("0.001"),
      });
      await c.publicClient.waitForTransactionReceipt({ hash });
      await c.send("claim", [BigInt(day + 1)]);
      assert.equal(
        await c.read("claimed", [BigInt(day + 1), c.accounts[0]]),
        true,
      );
    },
  );
  await check(
    "receiver rejection rolls back claimed state; reentry is blocked",
    async () => {
      const rejecting = await c.deploy(c.compiled["Mock.sol"].RejectingVoter, [
        c.tales,
      ]);
      const reentering = await c.deploy(
        c.compiled["Mock.sol"].ReenteringVoter,
        [c.tales],
      );
      const act = async (a, artifact, fn, args = []) => {
        const { request } = await c.publicClient.simulateContract({
          account: c.accounts[0],
          address: a,
          abi: artifact.abi,
          functionName: fn,
          args,
        });
        const h = await c.wallet.writeContract({ ...request, gas: 1_500_000n });
        return c.publicClient.waitForTransactionReceipt({ hash: h });
      };
      const r = await c.read("currentRound");
      await act(rejecting, c.compiled["Mock.sol"].RejectingVoter, "vote", [r]);
      await act(reentering, c.compiled["Mock.sol"].ReenteringVoter, "vote", [
        r,
      ]);
      const fund = await c.wallet.sendTransaction({
        account: c.accounts[0],
        to: c.tales,
        value: parseEther("0.0055"),
      });
      await c.publicClient.waitForTransactionReceipt({ hash: fund });
      await c.setTime("2026-11-04T00:00:01Z");
      await assert.rejects(
        act(rejecting, c.compiled["Mock.sol"].RejectingVoter, "claim", [
          BigInt(day + 2),
        ]),
      );
      assert.equal(
        await c.read("claimed", [BigInt(day + 2), rejecting]),
        false,
      );
      await act(reentering, c.compiled["Mock.sol"].ReenteringVoter, "claim", [
        BigInt(day + 2),
      ]);
      assert.equal(
        await c.read("claimed", [BigInt(day + 2), reentering]),
        true,
      );
      assert.equal(
        await c.publicClient.readContract({
          address: reentering,
          abi: c.compiled["Mock.sol"].ReenteringVoter.abi,
          functionName: "blocked",
        }),
        true,
      );
    },
  );
  console.log(`${checks} contract scenarios passed.`);
} finally {
  await c.provider.disconnect();
}
