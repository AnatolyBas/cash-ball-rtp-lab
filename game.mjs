export const MULTIPLIERS = {
  easy: [1.04,1.15,1.28,1.45,1.66,1.93,2.26,2.7,3.25,3.98,4.93,6.19,7.87,10.16,13.29,17.61,23.68,32.28,44.63,62.58],
  medium: [1.09,1.29,1.58,2,3.6,5.11,7.52,11.53,18.38,30.52,52.85,95.48,180.17,355.42,733.74,1586.88,3599.35,8572.18],
  hard: [1.14,1.45,1.93,2.72,4.07,6.47,10.91,19.61,37.62,77.23,170.02,402.45,1027.09,2834.38,8484.97,27649.15],
};

// A local visual simulator. Probabilities are placeholders, NOT a 96% RTP model.
// Production outcomes must come from a separately implemented RGS adapter.
export class DemoGame {
  constructor(random = Math.random) {
    this.random=random;this.balance=100000;this.phase='idle';this.charge=0;
    this.level=0;this.multiplier=1;this.position=-1;this.tiles=[];this.bet=1000;this.difficulty='easy';
  }
  start(bet, difficulty) {
    if (this.phase==='choice') throw new Error('Раунд ещё идёт');
    if (!Number.isSafeInteger(bet)||bet<100||bet>10000||bet>this.balance) throw new Error('Недостаточно демо-кредитов или неверная ставка');
    if (!MULTIPLIERS[difficulty]) throw new Error('Неизвестная сложность');
    this.bet=bet;this.difficulty=difficulty;this.balance-=bet;
    this.level=0;this.multiplier=1;this.charge=0;this.position=-1;this.phase='choice';this.tiles=[];
    for(let level=0;level<MULTIPLIERS[difficulty].length;level++) {
      const powerCount=1+Math.floor(this.random()*4);
      const positions=[0,1,2,3,4,5,6,7,8];
      for(let i=8;i>0;i--) { const j=Math.floor(this.random()*(i+1));[positions[i],positions[j]]=[positions[j],positions[i]]; }
      const power=new Set(positions.slice(0,powerCount));
      for(let i=0;i<10;i++) this.tiles.push({index:this.tiles.length,level:level+1,type:i===9?(level===MULTIPLIERS[difficulty].length-1?'gold':'green'):power.has(i)?'blue':'gray',multiplier:MULTIPLIERS[difficulty][level]});
    }
    return this.tiles;
  }
  advance() {
    if(this.phase!=='choice') throw new Error('Нельзя продолжить завершённый раунд');
    const events=[];let dashRemaining=0;let dash=false;
    if(this.position>=0) events.push({kind:'break',tile:this.tiles[this.position],charge:this.charge,dash:false});
    for(let i=this.position+1;i<this.tiles.length;i++) {
      const tile=this.tiles[i];this.position=i;
      const isMultiplier=tile.type==='green'||tile.type==='gold';
      if(!isMultiplier&&!dash&&this.random()<({easy:.009,medium:.017,hard:.026}[this.difficulty])) {
        this.phase='crashed';this.charge=0;
        events.push({kind:'crash',tile,charge:0,dash:false});return events;
      }
      if(isMultiplier) {
        this.level=tile.level;this.multiplier=tile.multiplier;
        if(dash) dashRemaining--;
        if(this.level===MULTIPLIERS[this.difficulty].length) {
          this.phase='finished';const payout=this.payout;this.balance+=payout;this.charge=0;
          events.push({kind:'finish',tile,charge:0,dash,payout});return events;
        }
        if(!dash||dashRemaining===0) {
          events.push({kind:'land',tile,charge:this.charge,dash});return events;
        }
      }
      if(tile.type==='blue'&&!dash) this.charge++;
      events.push({kind:'break',tile,charge:this.charge,dash});
      if(this.charge===10&&!dash) {
        dash=true;dashRemaining=2+Math.floor(this.random()*4);this.charge=0;
        events.push({kind:'dash',tile,charge:0,dash:true,levels:dashRemaining});
      }
    }
    throw new Error('Некорректное состояние шахты');
  }
  get payout() {return Math.round(this.bet*this.multiplier);}
  collect() {
    if(this.phase!=='choice'||this.level===0) throw new Error('Забрать можно только на множителе');
    const payout=this.payout;this.balance+=payout;this.phase='collected';this.charge=0;return payout;
  }
}
