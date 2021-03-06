function project(name: string, roots: string[]) {
  return {
    displayName: name,
    setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
    globals: {
      'ts-jest': {
        babelConfig: true,
        diagnostics: false,
      },
    },
    preset: '@enzymefinance/hardhat',
    roots,
  };
}

const projects = [
  // project('persistent', ['tests/persistent']),
  // project('core', ['tests/release/core']),
  // project('infrastructure', ['tests/release/infrastructure']),
  // project('policy', ['tests/release/extensions/policy-manager']),
  // project('integration', ['tests/release/extensions/integration-manager']),
  // project('fee', ['tests/release/extensions/fee-manager']),
  // project('peripheral', ['tests/release/peripheral']),
  // project('e2e', ['tests/release/e2e']),

  // project('core', ['tests/SelfTest/test-feeManager']),
  // project('core', ['tests/SelfTest/test-performanceFee']),
  // project('core', ['tests/SelfTest/test-managementFee']),
  // project('core', ['tests/SelfTest/test-hurdle-main']),
  // project('core', ['tests/SelfTest/test-feemanager-hurdle']),
  // project('core', ['tests/SelfTest/test-streaming']),
  // project('core', ['tests/SelfTest/test-feemanager-stream']),
  // project('core', ['tests/SelfTest/test-vault']),
  // project('core', ['tests/SelfTest/test-zeroAdapter']),
  // project('core', ['tests/SelfTest/test-uniswapV2-takeorder']),
  // project('core', ['tests/SelfTest/test-uniswapV2']),
  project('core', ['tests/SelfTest/test-fundActionWrap']),
].filter((project) => !!project);

export default {
  projects,
  testTimeout: 12000000,
};
