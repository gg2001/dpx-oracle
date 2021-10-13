import { run, ethers } from "hardhat";
import { Signer, Wallet } from "ethers";
import { UniswapV2Oracle, IUniswapV2Factory, UniswapV2Oracle__factory } from "../typechain";
import { addresses } from "../constants";

async function main() {
  const accounts: Signer[] = await ethers.getSigners();
  const owner: Wallet = <Wallet>accounts[0];
  const chainId: number = await owner.getChainId();
  console.log("Chain ID:", chainId);
  console.log("Owner address:", owner.address);

  if (!(chainId in addresses)) {
    throw new Error("Invalid chainId");
  }

  const factoryV2: IUniswapV2Factory = (await ethers.getContractAt(
    "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol:IUniswapV2Factory",
    addresses[chainId].factoryV2,
  )) as IUniswapV2Factory;
  const pairAddress: string = await factoryV2.getPair(addresses[chainId].token, addresses[chainId].WETH);

  const uniswapV2OracleFactory: UniswapV2Oracle__factory = (await ethers.getContractFactory(
    "contracts/UniswapV2Oracle.sol:UniswapV2Oracle",
    owner,
  )) as UniswapV2Oracle__factory;
  const uniswapV2Oracle: UniswapV2Oracle = await uniswapV2OracleFactory
    .connect(owner)
    .deploy(pairAddress, addresses[chainId].token, addresses[chainId].priceFeed);

  console.log("UniswapV2Oracle address:", uniswapV2Oracle.address);
  if (process.env.ETHERSCAN && chainId !== 1337) {
    console.log("Verifying...");
    await new Promise(r => setTimeout(r, 67500));
    try {
      await run("verify:verify", {
        address: uniswapV2Oracle.address,
        constructorArguments: [pairAddress, addresses[chainId].token, addresses[chainId].priceFeed],
      });
    } catch (error) {
      console.log(error);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
