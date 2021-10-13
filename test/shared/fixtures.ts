import { ethers } from "hardhat";
import { Wallet } from "ethers";
import { addresses } from "../../constants";
import { UniswapV2Oracle, IERC20, IUniswapV2Factory, IUniswapV2Pair, UniswapV2Oracle__factory } from "../../typechain";

interface UniswapV2OracleFixture {
  uniswapV2Oracle: UniswapV2Oracle;
  token: IERC20;
  WETH: IERC20;
  factoryV2: IUniswapV2Factory;
  pair: IUniswapV2Pair;
}

export async function uniswapV2OracleFixture(wallet: Wallet[]): Promise<UniswapV2OracleFixture> {
  const owner: Wallet = wallet[0];
  const chainId: number = await owner.getChainId();
  if (!(chainId in addresses)) {
    throw new Error("Invalid chainId");
  }

  const factoryV2: IUniswapV2Factory = (await ethers.getContractAt(
    "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol:IUniswapV2Factory",
    addresses[chainId].factoryV2,
  )) as IUniswapV2Factory;
  const token: IERC20 = (await ethers.getContractAt(
    "contracts/interfaces/IERC20.sol:IERC20",
    addresses[chainId].token,
  )) as IERC20;
  const WETH: IERC20 = (await ethers.getContractAt(
    "contracts/interfaces/IERC20.sol:IERC20",
    addresses[chainId].WETH,
  )) as IERC20;
  const pairAddress: string = await factoryV2.getPair(token.address, WETH.address);
  const pair: IUniswapV2Pair = (await ethers.getContractAt(
    "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol:IUniswapV2Pair",
    pairAddress,
  )) as IUniswapV2Pair;

  const uniswapV2OracleFactory: UniswapV2Oracle__factory = (await ethers.getContractFactory(
    "contracts/UniswapV2Oracle.sol:UniswapV2Oracle",
    owner,
  )) as UniswapV2Oracle__factory;
  const uniswapV2Oracle: UniswapV2Oracle = await uniswapV2OracleFactory
    .connect(owner)
    .deploy(pair.address, token.address);

  return { factoryV2, token, WETH, pair, uniswapV2Oracle };
}
