export const addresses: {
  [chainId: number]: {
    token: string;
    WETH: string;
    factoryV2: string;
    priceFeed: string;
  };
} = {
  1: {
    token: "0xEec2bE5c91ae7f8a338e1e5f3b5DE49d07AfdC81",
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    factoryV2: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    priceFeed: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  },
  1337: {
    token: "0xEec2bE5c91ae7f8a338e1e5f3b5DE49d07AfdC81",
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    factoryV2: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    priceFeed: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  },
  42161: {
    token: "0x6C2C06790b3E3E3c38e12Ee22F8183b37a13EE55",
    WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    factoryV2: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
    priceFeed: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",
  },
};
