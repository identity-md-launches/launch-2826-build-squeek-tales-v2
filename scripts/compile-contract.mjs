import fs from "node:fs";
import solc from "solc";
const input = {
  language: "Solidity",
  sources: {
    "SqueekTales.sol": {
      content: fs.readFileSync("contracts/SqueekTales.sol", "utf8"),
    },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "paris",
    outputSelection: {
      "*": {
        "*": [
          "abi",
          "evm.bytecode.object",
          "evm.deployedBytecode.object",
          "evm.deployedBytecode.immutableReferences",
        ],
      },
    },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
for (const e of output.errors ?? [])
  console[e.severity === "error" ? "error" : "warn"](e.formattedMessage);
if (output.errors?.some((e) => e.severity === "error")) process.exit(1);
const c = output.contracts["SqueekTales.sol"].SqueekTales;
fs.mkdirSync("src/generated", { recursive: true });
fs.writeFileSync(
  "src/generated/SqueekTales.json",
  JSON.stringify(
    {
      compiler: solc.version(),
      abi: c.abi,
      bytecode: `0x${c.evm.bytecode.object}`,
      deployedBytecode: `0x${c.evm.deployedBytecode.object}`,
      immutableReferences: c.evm.deployedBytecode.immutableReferences,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `SqueekTales compiled: ${c.evm.bytecode.object.length / 2} bytes creation code`,
);
