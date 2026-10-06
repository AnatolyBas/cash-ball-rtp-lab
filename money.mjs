// The wallet, not a currency-code allowlist, defines monetary precision.
export function validDecimals(n){return Number.isInteger(n)&&n>=0&&n<=18;}
export function toUnits(value,decimals=2){
 if(!validDecimals(decimals)||!['number','string'].includes(typeof value))throw new Error('Invalid monetary amount');
 const m=String(value).match(/^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
 if(!m)throw new Error('Invalid monetary amount');
 const exponent=Number(m[3]||0),fraction=m[2]||'';
 if(!Number.isInteger(exponent)||Math.abs(exponent)>100)throw new Error('Invalid monetary amount');
 const shift=decimals+exponent-fraction.length;
 let units=BigInt(m[1]+fraction);
 if(shift>=0)units*=10n**BigInt(shift);
 else {const divisor=10n**BigInt(-shift);units=(units+divisor/2n)/divisor;}
 if(units>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Monetary amount exceeds safe precision');
 return Number(units);
}
export function formatUnits(units,decimals=2,group=true){
 if(!validDecimals(decimals)||!Number.isSafeInteger(units))throw new Error('Invalid monetary units');
 const negative=units<0,raw=String(Math.abs(units)).padStart(decimals+1,'0');
 let whole=decimals?raw.slice(0,-decimals):raw;
 if(group)whole=whole.replace(/\B(?=(\d{3})+(?!\d))/g,',');
 return (negative?'-':'')+whole+(decimals?'.'+raw.slice(-decimals):'');
}
export function fromUnits(units,decimals=2){
 const value=Number(formatUnits(units,decimals,false));
 if(toUnits(value,decimals)!==units)throw new Error('Monetary amount cannot be represented by the protocol');
 return value;
}
