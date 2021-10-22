import { ethers, network, waffle } from "hardhat";
import { Signer, Wallet, BigNumber } from "ethers";
import chai, { expect } from "chai";
import { uniswapV2OracleFixture } from "./shared/fixtures";
import { getPrice } from "./shared/helpers";

const { solidity, createFixtureLoader } = waffle;
chai.use(solidity);
let loadFixture: ReturnType<typeof createFixtureLoader>;

describe("unit/UniswapV2Oracle", () => {
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
    it("should update price", async () => {
      const { uniswapV2Oracle, pair, token, priceFeed } = await loadFixture(uniswapV2OracleFixture);
      const period: number = (await uniswapV2Oracle.PERIOD()).toNumber();
      const { timestamp: blockTimestampLast } = await uniswapV2Oracle.lastObservation();

      await network.provider.send("evm_setNextBlockTimestamp", [blockTimestampLast + Math.round(period / 2)]);
      await network.provider.send("evm_mine");
      await expect(uniswapV2Oracle.update()).to.be.revertedWith("UniswapV2Oracle: PERIOD_NOT_ELAPSED");

      await network.provider.send("evm_setNextBlockTimestamp", [blockTimestampLast + period]);
      await network.provider.send("evm_mine");
      await uniswapV2Oracle.update();

      const price: BigNumber = await getPrice(token, pair, priceFeed);

      const one: BigNumber = ethers.utils.parseUnits("1", await token.decimals());
      const oraclePrice: BigNumber = await uniswapV2Oracle.consult(one);
      expect(oraclePrice).to.be.eq(price);
    });

    it("should update multiple times", async () => {
      const { uniswapV2Oracle, pair, token, priceFeed } = await loadFixture(uniswapV2OracleFixture);
      const period: number = (await uniswapV2Oracle.PERIOD()).toNumber();
      const { timestamp: blockTimestampLast } = await uniswapV2Oracle.lastObservation();

      await network.provider.send("evm_setNextBlockTimestamp", [blockTimestampLast + Math.round(period / 2)]);
      await network.provider.send("evm_mine");
      await expect(uniswapV2Oracle.update()).to.be.revertedWith("UniswapV2Oracle: PERIOD_NOT_ELAPSED");

      await network.provider.send("evm_setNextBlockTimestamp", [blockTimestampLast + period]);
      await network.provider.send("evm_mine");

      const day: number = 86400;
      const one: BigNumber = ethers.utils.parseUnits("1", await token.decimals());
      const price: BigNumber = await getPrice(token, pair, priceFeed);

      for (let i = 0; i < day / period; i++) {
        await uniswapV2Oracle.update();

        const oraclePrice: BigNumber = await uniswapV2Oracle.consult(one);
        expect(oraclePrice).to.be.eq(price);

        await network.provider.send("evm_increaseTime", [period]);
        await network.provider.send("evm_mine");
      }

      const prices = await uniswapV2Oracle.prices(one, 1);
      expect(prices[0]).to.be.eq(price);

      const daily = await uniswapV2Oracle.daily(one, 1);
      expect(daily[0]).to.be.eq(price);

      const hourly = await uniswapV2Oracle.hourly(one, 12);
      expect(hourly[0]).to.be.eq(price);

      expect(await uniswapV2Oracle.stddev(hourly)).to.be.eq(BigNumber.from("0"));
    });
  });

  describe("getPriceInUSD", async () => {
    it("should get USD price", async () => {
      const { uniswapV2Oracle, token, priceFeed, pair } = await loadFixture(uniswapV2OracleFixture);
      const period: number = (await uniswapV2Oracle.PERIOD()).toNumber();
      await network.provider.send("evm_increaseTime", [period]);
      await network.provider.send("evm_mine");
      await uniswapV2Oracle.update();

      const price: BigNumber = await getPrice(token, pair, priceFeed);

      await expect(uniswapV2Oracle.getPriceInUSD())
        .to.emit(uniswapV2Oracle, "PriceUpdated")
        .withArgs(token.address, price);

      const getUsdPrice = await uniswapV2Oracle.callStatic.getPriceInUSD();
      expect(getUsdPrice).to.be.eq(price);

      const usdPrice = await uniswapV2Oracle.viewPriceInUSD();
      expect(usdPrice).to.be.eq(price);
    });
  });
});
