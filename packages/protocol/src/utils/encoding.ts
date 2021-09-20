import { resolveArguments } from '@enzymefinance/ethers';
import { utils } from 'ethers';
import { sighash } from './sighash';

export function encodeArgs(types: (string | utils.ParamType)[], args: any[]) {
  const params = types.map((type) => utils.ParamType.from(type));
  const resolved = resolveArguments(params, args);
  const hex = utils.defaultAbiCoder.encode(params, resolved);
  return utils.hexlify(utils.arrayify(hex));
}

export function encodeFunctionData(fragment: utils.FunctionFragment, args: any[] = []) {
  const encodedArgs = encodeArgs(fragment.inputs, args);
  
  console.log("===param-002::", args, sighash(fragment));
  return utils.hexlify(utils.concat([sighash(fragment), encodedArgs]));
}
