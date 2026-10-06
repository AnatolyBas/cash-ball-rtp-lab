export function seeded(seed){let n=seed>>>0;return ()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
export function validate(c){
 if(!['local','rgs'].includes(c.source)||!['easy','medium','hard'].includes(c.mode))throw Error('Неизвестный режим');
 for(const [k,min,max] of [['rounds',1,1000000],['step',1,{easy:20,medium:18,hard:16}[c.mode]],['delay',0,60000],['seed',1,4294967295]])if(!Number.isInteger(c[k])||c[k]<min||c[k]>max)throw Error(`Некорректное поле ${k}`);
 if(!Number.isFinite(c.large)||c.large<1)throw Error('Некорректный порог крупной выплаты');
 if(c.target!==null&&(!Number.isFinite(c.target)||c.target<0))throw Error('Некорректный целевой RTP');
}
export async function playRound(game,stake,mode,target){
 const before=game.balance;await game.start(stake,mode);
 if(game.bet!==undefined&&game.bet!==stake)throw Error('RGS изменила ставку: прогон остановлен до броска');
 if(game.difficulty!==undefined&&game.difficulty!==mode)throw Error('RGS изменила сложность');
 let dash=0,crash=null,payout=0,step=0,multiplier=0;
 for(let guard=0;guard<30;guard++){
  const events=await game.advance();dash+=events.filter(e=>e.kind==='dash').length;
  const failure=events.find(e=>e.kind==='crash');const finish=events.find(e=>e.kind==='finish');
  if(failure){crash={step:failure.tile.level,multiplier:failure.tile.multiplier};step=crash.step;break;}
  step=game.level;
  if(finish){payout=finish.payout;multiplier=finish.tile.multiplier;break;}
  if(step>=target){payout=await game.collect();multiplier=game.multiplier??game.multipliers[mode][step-1];break;}
  if(guard===29)throw Error('Превышено число шагов раунда');
 }
 if(!Number.isSafeInteger(payout)||payout<0)throw Error('Некорректная выплата');
 return {stake,payout,balance:game.balance,step,crash,dash,multiplier,mismatch:BigInt(before)-BigInt(stake)+BigInt(payout)!==BigInt(game.balance)};
}
export class Stats{
 constructor(initial,large){this.initial=initial;this.large=large;this.n=0;this.stakes=0n;this.paid=0n;this.mean=0;this.m2=0;this.dash=0;this.big=0;this.max=0;this.mismatch=0;this.balance=initial;this.crashes={};}
 add(r){this.n++;this.stakes+=BigInt(r.stake);this.paid+=BigInt(r.payout);const x=r.payout/r.stake,d=x-this.mean;this.mean+=d/this.n;this.m2+=d*(x-this.mean);this.dash+=r.dash;this.big+=x>=this.large?1:0;this.max=Math.max(this.max,r.payout);this.mismatch+=r.mismatch?1:0;this.balance=r.balance;if(r.crash){const key=r.crash.step;this.crashes[key]??={...r.crash,count:0};this.crashes[key].count++;}}
 snapshot(){const error=this.n>1?1.96*Math.sqrt(this.m2/(this.n-1)/this.n)*100:null;return {n:this.n,stakes:this.stakes.toString(),paid:this.paid.toString(),rtp:this.n?Number(this.paid)/Number(this.stakes)*100:0,error,dash:this.dash,big:this.big,max:this.max,mismatch:this.mismatch,balance:this.balance,initial:this.initial,crashes:Object.values(this.crashes)};}
}
