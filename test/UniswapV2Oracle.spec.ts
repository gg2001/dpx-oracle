import { ethers, network, waffle } from "hardhat";
import { Signer, Wallet, BigNumber } from "ethers";
import chai, { expect } from "chai";
import { encodePrice } from "./shared/utilities";
import { uniswapV2OracleFixture } from "./shared/fixtures";

const { solidity, createFixtureLoader } = waffle;
chai.use(solidity);
let loadFixture: ReturnType<typeof createFixtureLoader>;

describe("unit/UniswapV3PositionOracle", () => {
  let accounts: Signer[];
  let owner: Wallet;

  before(async () => {
    accounts = await ethers.getSigners();
    owner = <Wallet>accounts[0];
    loadFixture = createFixtureLoader([owner], waffle.provider);
  });

  describe("constructor", async () => {
    it("should set immutables", async () => {
      const { uniswapV2Oracle, pair, token } = await loadFixture(uniswapV2OracleFixture);
      expect(await uniswapV2Oracle.pair()).to.eq(pair.address);
      expect(await uniswapV2Oracle.token()).to.eq(token.address);
      expect(await uniswapV2Oracle.token0()).to.eq(await pair.token0());
      expect(await uniswapV2Oracle.token1()).to.eq(await pair.token1());
    });
  });

  describe("update", async () => {
    it("should update", async () => {
      const { uniswapV2Oracle, pair, token } = await loadFixture(uniswapV2OracleFixture);
      const period: number = (await uniswapV2Oracle.PERIOD()).toNumber();
      const blockTimestampLast: number = await uniswapV2Oracle.blockTimestampLast();

      await network.provider.send("evm_setNextBlockTimestamp", [blockTimestampLast + Math.round(period / 2)]);
      await network.provider.send("evm_mine");
      await expect(uniswapV2Oracle.update()).to.be.revertedWith("UniswapV2Oracle: PERIOD_NOT_ELAPSED");

      await network.provider.send("evm_setNextBlockTimestamp", [blockTimestampLast + period]);
      await network.provider.send("evm_mine");
      await uniswapV2Oracle.update();

      const one: BigNumber = ethers.utils.parseUnits("1", await token.decimals());
      const reserves = await pair.getReserves();
      const price: BigNumber =
        token.address == (await pair.token0())
          ? reserves.reserve1.mul(one).div(reserves.reserve0)
          : reserves.reserve0.mul(one).div(reserves.reserve1);
      const oraclePrice: BigNumber = await uniswapV2Oracle.consult(one);
      expect(oraclePrice).to.be.eq(price);
    });
  });
});
