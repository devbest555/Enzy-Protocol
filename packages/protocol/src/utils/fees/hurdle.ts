import { BigNumber, BigNumberish } from 'ethers';
import { AddressLike } from '@enzymefinance/ethers';
import { encodeArgs } from '../encoding';

export function hurdleConfigArgs({ rate, period, hurdleRate }: { rate: BigNumberish; period: BigNumberish; hurdleRate: BigNumberish }) {
  return encodeArgs(['uint256', 'uint256', 'uint256'], [rate, period, hurdleRate]);
}

export function performanceFeeAssetDue({
  rate,
  hurdleRate,
  denominationAsset,
  currentAssetValue,
  initialAssetValue,
}: {
  rate: BigNumberish;
  hurdleRate: BigNumberish;
  denominationAsset: AddressLike;
  currentAssetValue: BigNumberish;
  initialAssetValue: BigNumberish;
}) {

  // Accrued value
  const _currentAssetValue = BigNumber.from(currentAssetValue);
  const _initialAssetValue = BigNumber.from(initialAssetValue);
  const _hurdleRate = BigNumber.from(hurdleRate);
  const _rate = BigNumber.from(rate);
  const performanceAssetValue = _currentAssetValue.sub(
    _initialAssetValue.add(_initialAssetValue).mul(_hurdleRate)
  );
  const assetValueDue_ = performanceAssetValue.mul(_rate).div(100);

  return assetValueDue_;
}
