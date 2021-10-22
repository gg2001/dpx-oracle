import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { IERC20, IUniswapV2Pair, AggregatorV3Interface } from "../../typechain";

export async function getPrice(
  token: IERC20,
  pair: IUniswapV2Pair,
  priceFeed: AggregatorV3Interface,
): Promise<BigNumber> {
  const one: BigNumber = ethers.utils.parseUnits("1", await token.decimals());
  const reserves = await pair.getReserves();
  const feedPrice: BigNumber = (await priceFeed.latestRoundData()).answer;
  const price: BigNumber = (
    token.address == (await pair.token0())
      ? reserves.reserve1.mul(one).div(reserves.reserve0)
      : reserves.reserve0.mul(one).div(reserves.reserve1)
  )
    .mul(feedPrice)
    .div(one);
  return price;
}
