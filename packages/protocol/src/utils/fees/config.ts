import { AddressLike } from '@enzymefinance/ethers';
import { BytesLike } from 'ethers';
import { encodeArgs } from '../encoding';
import { BigNumberish } from 'ethers';

export function feeManagerConfigArgs({ fees, settings }: { fees: AddressLike[]; settings: BytesLike[] }) {
  return encodeArgs(['address[]', 'bytes[]'], [fees, settings]);
}

export function payoutSharesOutstandingForFeesArgs(fees: AddressLike[]) {
  return encodeArgs(['address[]'], [fees]);
}

export function protocolFeesArgs({ feeDeposit, feeWithdraw, feePerform, feeStream }: 
  { feeDeposit: BigNumberish; feeWithdraw: BigNumberish; feePerform: BigNumberish; feeStream: BigNumberish }) {
  return encodeArgs(['uint256', 'uint256', 'uint256', 'uint256'], [feeDeposit, feeWithdraw, feePerform, feeStream]);
}
// export function protocolFeesArgs(settings: BytesLike[]) {
//   return encodeArgs(['bytes[]'], [settings]);
// }
