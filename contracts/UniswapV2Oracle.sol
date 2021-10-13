// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;

import { IUniswapV2Pair } from "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import { IOracle } from "./interfaces/IOracle.sol";
import { IERC20 } from "./interfaces/IERC20.sol";
import { AggregatorV3Interface } from "./interfaces/AggregatorV3Interface.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { FixedPoint } from "@uniswap/lib/contracts/libraries/FixedPoint.sol";
import { UniswapV2OracleLibrary } from "@uniswap/v2-periphery/contracts/libraries/UniswapV2OracleLibrary.sol";

// fixed window oracle that recomputes the average price for the entire period once every period
// note that the price average is only guaranteed to be over at least 1 period, but may be over a longer period
contract UniswapV2Oracle is IOracle {
    using FixedPoint for *;
    using SafeMath for uint256;

    uint256 public constant PERIOD = 15 minutes;

    IUniswapV2Pair public immutable pair;
    AggregatorV3Interface public immutable priceFeed;
    address public immutable token;
    address public immutable token0;
    address public immutable token1;

    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;
    uint32 public blockTimestampLast;
    FixedPoint.uq112x112 public price0Average;
    FixedPoint.uq112x112 public price1Average;

    uint256 private latestAnswer;

    constructor(
        address _pair,
        address _token,
        address _priceFeed
    ) public {
        pair = IUniswapV2Pair(_pair);
        address _token0 = IUniswapV2Pair(_pair).token0();
        address _token1 = IUniswapV2Pair(_pair).token1();
        token0 = _token0;
        token1 = _token1;
        require(_token == _token0 || _token == _token1, "UniswapV2Oracle: INVALID_TOKEN");
        token = _token;
        price0CumulativeLast = IUniswapV2Pair(_pair).price0CumulativeLast(); // fetch the current accumulated price value (1 / 0)
        price1CumulativeLast = IUniswapV2Pair(_pair).price1CumulativeLast(); // fetch the current accumulated price value (0 / 1)
        uint112 reserve0;
        uint112 reserve1;
        (reserve0, reserve1, blockTimestampLast) = IUniswapV2Pair(_pair).getReserves();
        require(reserve0 != 0 && reserve1 != 0, "UniswapV2Oracle: NO_RESERVES"); // ensure that there's liquidity in the pair
        priceFeed = AggregatorV3Interface(_priceFeed);
    }

    function update() external {
        (uint256 price0Cumulative, uint256 price1Cumulative, uint32 blockTimestamp) = UniswapV2OracleLibrary
            .currentCumulativePrices(address(pair));
        uint32 timeElapsed = blockTimestamp - blockTimestampLast; // overflow is desired

        // ensure that at least one full period has passed since the last update
        require(timeElapsed >= PERIOD, "UniswapV2Oracle: PERIOD_NOT_ELAPSED");

        // overflow is desired, casting never truncates
        // cumulative price is in (uq112x112 price * seconds) units so we simply wrap it after division by time elapsed
        price0Average = FixedPoint.uq112x112(uint224((price0Cumulative - price0CumulativeLast) / timeElapsed));
        price1Average = FixedPoint.uq112x112(uint224((price1Cumulative - price1CumulativeLast) / timeElapsed));

        price0CumulativeLast = price0Cumulative;
        price1CumulativeLast = price1Cumulative;
        blockTimestampLast = blockTimestamp;
    }

    function getPriceInUSD() external override returns (uint256) {
        uint8 tokenDecimals = IERC20(token).decimals();
        uint256 tokenUniswapPrice = consult(10**uint256(tokenDecimals));
        (, int256 feedPrice, , , ) = priceFeed.latestRoundData();
        uint256 price = tokenUniswapPrice.mul(uint256(feedPrice)).div(10**uint256(tokenDecimals));
        latestAnswer = price;
        emit PriceUpdated(token, price);
        return price;
    }

    function viewPriceInUSD() external view override returns (uint256) {
        return latestAnswer;
    }

    // note this will always return 0 before update has been called successfully for the first time.
    function consult(uint256 amountIn) public view returns (uint256 amountOut) {
        if (token == token0) {
            amountOut = price0Average.mul(amountIn).decode144();
        } else if (token == token1) {
            amountOut = price1Average.mul(amountIn).decode144();
        }
    }
}
