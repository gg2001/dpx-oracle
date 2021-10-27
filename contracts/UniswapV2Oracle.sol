// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IOracle } from "./interfaces/IOracle.sol";
import { IUniswapV2Pair } from "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import { IERC20 } from "./interfaces/IERC20.sol";
import { AggregatorV3Interface } from "./interfaces/AggregatorV3Interface.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { FixedPoint } from "@uniswap/lib/contracts/libraries/FixedPoint.sol";
import { UniswapV2Library } from "@uniswap/v2-periphery/contracts/libraries/UniswapV2Library.sol";
import { UniswapV2OracleLibrary } from "@uniswap/v2-periphery/contracts/libraries/UniswapV2OracleLibrary.sol";

// fixed window oracle that recomputes the average price for the entire period once every period
// note that the price average is only guaranteed to be over at least 1 period, but may be over a longer period
contract UniswapV2Oracle is Ownable, IOracle {
    using FixedPoint for *;
    using SafeMath for uint256;

    struct Observation {
        uint32 timestamp;
        uint256 price0Cumulative;
        uint256 price1Cumulative;
        uint256 feedPrice;
    }

    uint256 public period;

    IUniswapV2Pair public immutable pair;
    AggregatorV3Interface public immutable priceFeed;
    address public immutable token;
    address public immutable token0;
    address public immutable token1;
    uint8 public immutable decimals;

    uint256 private latestAnswer;

    Observation[] public observations;

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
        decimals = IERC20(_token).decimals();
        (uint112 reserve0, uint112 reserve1, ) = IUniswapV2Pair(_pair).getReserves();
        require(reserve0 != 0 && reserve1 != 0, "UniswapV2Oracle: NO_RESERVES"); // ensure that there's liquidity in the pair
        priceFeed = AggregatorV3Interface(_priceFeed);

        (uint256 price0Cumulative, uint256 price1Cumulative, uint32 blockTimestamp) = UniswapV2OracleLibrary
            .currentCumulativePrices(_pair);
        (, int256 feedPrice, , , ) = AggregatorV3Interface(_priceFeed).latestRoundData();
        observations.push(Observation(blockTimestamp, price0Cumulative, price1Cumulative, uint256(feedPrice)));

        period = 2 hours;
        emit UpdatePeriod(period);
    }

    function setPeriod(uint256 _period) external onlyOwner {
        period = _period;
        emit UpdatePeriod(_period);
    }

    function update() external {
        require(_update(), "UniswapV2Oracle: PERIOD_NOT_ELAPSED");
    }

    function getPriceInUSD() external override returns (uint256) {
        _update();
        uint256 price = consult(10**uint256(decimals));
        latestAnswer = price;
        emit PriceUpdated(token, price);
        return price;
    }

    function viewPriceInUSD() external view override returns (uint256) {
        return latestAnswer;
    }

    function observationLength() external view returns (uint256) {
        return observations.length;
    }

    function lastObservation() public view returns (Observation memory) {
        return observations[observations.length - 1];
    }

    function quote(uint256 amountIn, uint256 granularity) external view returns (uint256 amountOut) {
        uint256 priceAverageCumulative = 0;
        uint256 length = observations.length - 1;
        uint256 i = length.sub(granularity);

        uint256 nextIndex = 0;
        if (token == token0) {
            for (; i < length; i++) {
                nextIndex = i + 1;
                priceAverageCumulative += computeAmountOut(
                    observations[i].price0Cumulative,
                    observations[nextIndex].price0Cumulative,
                    observations[nextIndex].feedPrice,
                    amountIn,
                    observations[nextIndex].timestamp - observations[i].timestamp
                );
            }
        } else if (token == token1) {
            for (; i < length; i++) {
                nextIndex = i + 1;
                priceAverageCumulative += computeAmountOut(
                    observations[i].price1Cumulative,
                    observations[nextIndex].price1Cumulative,
                    observations[nextIndex].feedPrice,
                    amountIn,
                    observations[nextIndex].timestamp - observations[i].timestamp
                );
            }
        }
        amountOut = priceAverageCumulative.div(granularity);
    }

    function prices(uint256 amountIn, uint256 points) external view returns (uint256[] memory) {
        return sample(amountIn, points, 1);
    }

    function hourly(uint256 amountIn, uint256 points) external view returns (uint256[] memory) {
        return sample(amountIn, points, 1 hours / period);
    }

    function daily(uint256 amountIn, uint256 points) external view returns (uint256[] memory) {
        return sample(amountIn, points, 1 days / period);
    }

    function weekly(uint256 amountIn, uint256 points) external view returns (uint256[] memory) {
        return sample(amountIn, points, 1 weeks / period);
    }

    function sample(
        uint256 amountIn,
        uint256 points,
        uint256 window
    ) public view returns (uint256[] memory) {
        uint256[] memory _prices = new uint256[](points);

        uint256 length = observations.length - 1;
        uint256 i = length.sub(points * window);
        uint256 nextIndex = 0;
        uint256 index = 0;

        if (token == token0) {
            for (; i < length; i += window) {
                nextIndex = i + window;
                _prices[index] = computeAmountOut(
                    observations[i].price0Cumulative,
                    observations[nextIndex].price0Cumulative,
                    observations[nextIndex].feedPrice,
                    amountIn,
                    observations[nextIndex].timestamp - observations[i].timestamp
                );
                index = index + 1;
            }
        } else if (token == token1) {
            for (; i < length; i += window) {
                nextIndex = i + window;
                _prices[index] = computeAmountOut(
                    observations[i].price1Cumulative,
                    observations[nextIndex].price1Cumulative,
                    observations[nextIndex].feedPrice,
                    amountIn,
                    observations[nextIndex].timestamp - observations[i].timestamp
                );
                index = index + 1;
            }
        }
        return _prices;
    }

    function consult(uint256 amountIn) public view returns (uint256 amountOut) {
        Observation memory _observation = lastObservation();
        (uint256 price0Cumulative, uint256 price1Cumulative, uint32 blockTimestamp) = UniswapV2OracleLibrary
            .currentCumulativePrices(address(pair));
        if (blockTimestamp == _observation.timestamp) {
            _observation = observations[observations.length - 2];
        }

        uint32 timeElapsed = blockTimestamp - _observation.timestamp;
        timeElapsed = timeElapsed == 0 ? 1 : timeElapsed;
        if (token == token0) {
            amountOut = computeAmountOut(
                _observation.price0Cumulative,
                price0Cumulative,
                _observation.feedPrice,
                amountIn,
                timeElapsed
            );
        } else if (token == token1) {
            amountOut = computeAmountOut(
                _observation.price1Cumulative,
                price1Cumulative,
                _observation.feedPrice,
                amountIn,
                timeElapsed
            );
        }
    }

    /// @dev sqrt calculates the square root of a given number x
    /// @dev for precision into decimals the number must first
    /// @dev be multiplied by the precision factor desired
    /// @param x uint256 number for the calculation of square root
    function sqrt(uint256 x) public pure returns (uint256) {
        uint256 c = (x + 1) / 2;
        uint256 b = x;
        while (c < b) {
            b = c;
            c = (x / c + c) / 2;
        }
        return b;
    }

    /// @dev stddev calculates the standard deviation for an array of integers
    /// @dev precision is the same as sqrt above meaning for higher precision
    /// @dev the decimal place must be moved prior to passing the params
    /// @param numbers uint[] array of numbers to be used in calculation
    function stddev(uint256[] memory numbers) public pure returns (uint256 sd) {
        uint256 sum = 0;
        for (uint256 i = 0; i < numbers.length; i++) {
            sum += numbers[i];
        }
        uint256 mean = sum / numbers.length; // Integral value; float not supported in Solidity
        sum = 0;
        uint256 i;
        for (i = 0; i < numbers.length; i++) {
            sum += (numbers[i] - mean)**2;
        }
        sd = sqrt(sum / (numbers.length - 1)); //Integral value; float not supported in Solidity
        return sd;
    }

    /// @dev blackScholesEstimate calculates a rough price estimate for an ATM option
    /// @dev input parameters should be transformed prior to being passed to the function
    /// @dev so as to remove decimal places otherwise results will be far less accurate
    /// @param _vol uint256 volatility of the underlying converted to remove decimals
    /// @param _underlying uint256 price of the underlying asset
    /// @param _time uint256 days to expiration in years multiplied to remove decimals
    function blackScholesEstimate(
        uint256 _vol,
        uint256 _underlying,
        uint256 _time
    ) public pure returns (uint256 estimate) {
        estimate = 40 * _vol * _underlying * sqrt(_time);
        return estimate;
    }

    /// @dev fromReturnsBSestimate first calculates the stddev of an array of price returns
    /// @dev then uses that as the volatility param for the blackScholesEstimate
    /// @param _numbers uint256[] array of price returns for volatility calculation
    /// @param _underlying uint256 price of the underlying asset
    /// @param _time uint256 days to expiration in years multiplied to remove decimals
    function retBasedBlackScholesEstimate(
        uint256[] memory _numbers,
        uint256 _underlying,
        uint256 _time
    ) public pure {
        uint256 _vol = stddev(_numbers);
        blackScholesEstimate(_vol, _underlying, _time);
    }

    function _update() internal returns (bool) {
        Observation memory _point = lastObservation();
        (uint256 price0Cumulative, uint256 price1Cumulative, uint32 blockTimestamp) = UniswapV2OracleLibrary
            .currentCumulativePrices(address(pair));
        uint32 timeElapsed = blockTimestamp - _point.timestamp; // overflow is desired

        // ensure that at least one full period has passed since the last update
        if (timeElapsed >= period) {
            (, int256 feedPrice, , , ) = priceFeed.latestRoundData();
            observations.push(Observation(blockTimestamp, price0Cumulative, price1Cumulative, uint256(feedPrice)));
            return true;
        } else {
            return false;
        }
    }

    function computeAmountOut(
        uint256 priceCumulativeStart,
        uint256 priceCumulativeEnd,
        uint256 feedPrice,
        uint256 amountIn,
        uint32 timeElapsed
    ) internal view returns (uint256 amountOut) {
        // overflow is desired.
        FixedPoint.uq112x112 memory priceAverage = FixedPoint.uq112x112(
            uint224((priceCumulativeEnd - priceCumulativeStart) / timeElapsed)
        );
        amountOut = priceAverage.mul(amountIn).decode144();
        amountOut = amountOut.mul(feedPrice).div(10**uint256(decimals));
    }

    event UpdatePeriod(uint256 period);
}
