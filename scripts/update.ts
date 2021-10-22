import { ethers, network } from "hardhat";
import { Signer, Wallet, BigNumber } from "ethers";
import { UniswapV2Oracle, IUniswapV2Factory, IUniswapV2Router02, IERC20, UniswapV2Oracle__factory } from "../typechain";
import { addresses } from "../constants";

async function main() {
  const accounts: Signer[] = await ethers.getSigners();
  const owner: Wallet = <Wallet>accounts[0];
  const chainId: number = await owner.getChainId();

  if (!(chainId in addresses)) {
    throw new Error("Invalid chainId");
  }

  const factoryV2: IUniswapV2Factory = (await ethers.getContractAt(
    "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol:IUniswapV2Factory",
    addresses[chainId].factoryV2,
  )) as IUniswapV2Factory;
  const routerV2: IUniswapV2Router02 = (await ethers.getContractAt(
    "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol:IUniswapV2Router02",
    addresses[chainId].routerV2,
  )) as IUniswapV2Router02;
  const token: IERC20 = (await ethers.getContractAt(
    "contracts/interfaces/IERC20.sol:IERC20",
    addresses[chainId].token,
  )) as IERC20;
  const wethAddress: string = addresses[chainId].WETH;
  const pairAddress: string = await factoryV2.getPair(addresses[chainId].token, addresses[chainId].WETH);

  const uniswapV2OracleFactory: UniswapV2Oracle__factory = (await ethers.getContractFactory(
    "contracts/UniswapV2Oracle.sol:UniswapV2Oracle",
    owner,
  )) as UniswapV2Oracle__factory;
  const uniswapV2Oracle: UniswapV2Oracle = await uniswapV2OracleFactory
    .connect(owner)
    .deploy(pairAddress, addresses[chainId].token, addresses[chainId].priceFeed);

  const period: number = (await uniswapV2Oracle.PERIOD()).toNumber();
  const { timestamp: blockTimestampLast } = await uniswapV2Oracle.lastObservation();

  await network.provider.send("evm_setNextBlockTimestamp", [blockTimestampLast + period]);
  await network.provider.send("evm_mine");

  const day: number = 86400;
  const one: BigNumber = ethers.utils.parseUnits("1", await token.decimals());

  let lastTokenReceived: BigNumber = BigNumber.from("0");

  for (let i = 0; i < day / period; i++) {
    await uniswapV2Oracle.connect(owner).update();

    if (i % 2 == 0) {
      const tokenBalance: BigNumber = await token.balanceOf(owner.address);
      await routerV2
        .connect(owner)
        .swapExactETHForTokens(0, [wethAddress, token.address], owner.address, ethers.constants.MaxUint256, {
          value: ethers.utils.parseEther("1"),
        });
      lastTokenReceived = (await token.balanceOf(owner.address)).sub(tokenBalance);
    } else {
      await token.approve(routerV2.address, lastTokenReceived);
      await routerV2
        .connect(owner)
        .swapExactTokensForETH(
          lastTokenReceived,
          0,
          [token.address, wethAddress],
          owner.address,
          ethers.constants.MaxUint256,
        );
    }

    await network.provider.send("evm_increaseTime", [period]);
    await network.provider.send("evm_mine");
  }

  const hourly = await uniswapV2Oracle.hourly(one, 12);
  console.log(hourly.map(value => ethers.utils.formatUnits(value, 8)));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
