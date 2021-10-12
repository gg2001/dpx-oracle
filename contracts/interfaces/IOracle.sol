// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.5.16;

interface IOracle {
    event PriceUpdated(address asset, uint256 newPrice);

    function getPriceInUSD() external returns (uint256);

    function viewPriceInUSD() external view returns (uint256);
}
