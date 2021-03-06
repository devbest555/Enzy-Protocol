import { AddressLike } from '@enzymefinance/ethers';
import { StandardToken } from '@taodao/protocol';

export async function getAssetBalances({ account, assets }: { account: AddressLike; assets: StandardToken[] }) {
  return Promise.all(assets.map((asset) => asset.balanceOf(account)));
}
