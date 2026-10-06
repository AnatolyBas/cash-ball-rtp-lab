import {validDecimals,toUnits,fromUnits} from './money.mjs';
// No copied cookies, tokens, server-supplied JavaScript or automatic bet retries.
export class RgsTransport {
  constructor(socket, timeout=12000) {
    this.socket=socket; this.timeout=timeout; this.pending=null; this.closed=false;
    socket.addEventListener('message',e=>{
      let reply;try{reply=JSON.parse(e.data);}catch{return this.fail('Некорректный ответ РГС');}
      const p=this.pending;if(!p)return;
      if(reply.error!==undefined){this.fail(`Ошибка РГС ${reply.error}`);return;}
      if(!reply.on||Object.keys(p.request).some(k=>JSON.stringify(reply.on[k])!==JSON.stringify(p.request[k])))return;
      clearTimeout(p.timer);this.pending=null;p.resolve(reply);
    });
    socket.addEventListener('close',()=>this.fail('Соединение закрыто. Результат команды может быть неизвестен; обновите подключение.'));
    socket.addEventListener('error',()=>this.fail('Ошибка соединения с РГС'));
  }
  fail(message){this.closed=true;const p=this.pending;this.pending=null;if(p){clearTimeout(p.timer);p.reject(new Error(message));}this.socket.close();}
  request(request){
    if(this.closed||this.socket.readyState!==1)return Promise.reject(new Error('РГС не подключена'));
    if(this.pending)return Promise.reject(new Error('Дождитесь ответа РГС'));
    return new Promise((resolve,reject)=>{
      this.pending={request,resolve,reject,timer:setTimeout(()=>this.fail('РГС не ответила. Повтор ставки запрещён до проверки состояния.'),this.timeout)};
      try{this.socket.send(JSON.stringify(request));}catch{this.fail('Не удалось отправить команду');}
    });
  }
}

export function tower(multipliers){
  return multipliers.flatMap((multiplier,l)=>Array.from({length:11},(_,i)=>({index:l*11+i,level:l+1,type:i===10?(l===multipliers.length-1?'gold':'green'):'gray',multiplier})));
}

// A dash is resolved after the complete row, so that row can exceed ten.
function validRowCharge(row, more) {
  return Number.isInteger(row.collected) && row.collected >= 0
    && row.collected <= (more ? 10 + row.bricks.filter(b => b === 2).length : 10);
}

// A reconnect snapshot may contain only the last result row, not the round history.
// Restore its final position directly; never replay it as a new bet or debit.
export function restorePrevious(previous,multipliers){
  if(previous===undefined||previous===null)return null;
  if(typeof previous!=='object'||Array.isArray(previous))throw new Error('Некорректный previous РГС');
  if(!Object.keys(previous).length)return null;
  if(previous.playing!==true||previous.finished===true)throw new Error('Нужен подтверждённый формат завершённого previous РГС');
  const values=multipliers[previous.level],step=previous.step,charge=previous.collected;
  if(!Array.isArray(values)||!Number.isInteger(step)||step<1||step>=values.length||!Number.isInteger(charge)||charge<0||charge>10)throw new Error('Некорректная позиция previous РГС');
  if(!Array.isArray(previous.result)||!previous.result.length)throw new Error('Нет результата previous РГС');
  let lastStep=0;
  const tiles=tower(values);
  for(const row of previous.result){
    if(!Number.isInteger(row.step)||row.step<=lastStep||row.step>step||!Array.isArray(row.bricks)||row.bricks.length!==10||row.bricks.some(v=>v!==1&&v!==2)||!validRowCharge(row,row.step<step))throw new Error('Некорректный результат previous РГС');
    row.bricks.forEach((value,i)=>{tiles[(row.step-1)*11+i].type=value===2?'blue':'gray';});
    lastStep=row.step;
  }
  if(lastStep!==step||previous.result.at(-1).collected!==charge)throw new Error('Несогласованный previous РГС');
  return {tiles,level:step,charge,difficulty:previous.level,index:step*11-1,multiplier:values[step-1]};
}

export function decodeSteps(bet,tiles,previousStep=0,previousCharge=0,decimals=2){
  if(!Array.isArray(bet.result)||!bet.result.length)throw new Error('РГС не вернула шаги');
  const events=[];let step=previousStep,charge=previousCharge,dash=false;
  if(step>0)events.push({kind:'break',tile:tiles[step*11-1],charge,dash});
  for(let r=0;r<bet.result.length;r++){
    const row=bet.result[r];
    if(row.step!==step+1||!Array.isArray(row.bricks)||row.bricks.length!==10||row.bricks.some(b=>![0,1,2].includes(b))||!validRowCharge(row,r<bet.result.length-1)||!tiles[row.step*11-1])throw new Error('Неизвестный формат шага РГС');
    const more=r<bet.result.length-1;
    // Reveal every disk reported by the server, including those below a crash.
    // Playback and charge collection still stop at the first zero.
    row.bricks.forEach((brick,i)=>{tiles[step*11+i].type=brick===2?'blue':'gray';});
    let crashed=false,dashStartedHere=false;
    for(let i=0;i<10;i++){
      const tile=tiles[step*11+i];
      if(row.bricks[i]===0){events.push({kind:'crash',tile,charge:0,dash});crashed=true;break;}
      if(row.bricks[i]===2)charge=Math.min(10,charge+1);
      events.push({kind:'break',tile,charge,dash});
      // Animate immediately at the threshold, but only when the reply confirms
      // the automatic continuation. Never invent a dash on a losing/final row.
      if(more&&!dash&&charge===10){
        events.push({kind:'dash',tile,charge:0,dash:true,levels:bet.result.length-r-1});
        dash=true;dashStartedHere=true;charge=0;
      }
    }
    step=row.step;
    if(crashed){if(r!==bet.result.length-1||bet.playing!==false||bet.finished!==true||Number(bet.win)!==0)throw new Error('Несогласованный краш РГС');return {events,step,charge:0};}
    // The triggering row reports its pre-dash total (possibly 11+).
    // Subsequent rows already report the remaining charge from the server.
    charge=dashStartedHere?Math.max(0,row.collected-10):row.collected;
    const tile=tiles[step*11-1];
    if(more&&!dash){events.push({kind:'dash',tile,charge:0,dash:true,levels:bet.result.length-r-1});dash=true;charge=Math.max(0,row.collected-10);}
    events.push({kind:more?'break':bet.finished?'finish':'land',tile,charge,dash,payout:bet.finished?toUnits(bet.win,decimals):undefined});
  }
  return {events,step,charge};
}

export class RgsGame {
  constructor(transport){this.transport=transport;this.decimals=2;this.balance=0;this.phase='idle';this.level=0;this.charge=0;this.tiles=[];this.bet=100;this.difficulty='easy';this.multipliers={};this.bets=[];this.restored=false;this.starting=false;}
  wallet(reply){if(!Number.isFinite(Number(reply.wallet?.balance)))throw new Error('Нет баланса РГС');if(reply.wallet.decimals!==undefined&&reply.wallet.decimals!==this.decimals)throw new Error('Wallet precision changed');if(reply.wallet.currency!==undefined&&this.currency&&reply.wallet.currency!==this.currency)throw new Error('Wallet currency changed');this.balance=toUnits(reply.wallet.balance,this.decimals);}
  async connect(location){
    const auth=await this.transport.request({set:'authentication',location});
    if(auth.authentication!==true)throw new Error('Авторизация РГС не подтверждена');
    const selected=await this.transport.request({set:'game',game:'crb1'});
    if(selected.game?.tag!=='crb1'||typeof selected.wallet?.currency!=='string'||!validDecimals(selected.wallet?.decimals)){
      console.error('RGS_GAME_REJECTED',JSON.stringify({tag:selected.game?.tag??null,demo:selected.game?.demo??null,currency:selected.wallet?.currency??null,decimals:selected.wallet?.decimals??null}));
      throw new Error('Ожидалась игра crb1 с валютой и корректной точностью кошелька');
    }
    this.currency=selected.wallet.currency;this.decimals=selected.wallet.decimals;
    this.demo=selected.game.demo===true;
    for(const mode of ['easy','medium','hard'])if(!Array.isArray(selected.game.multiplier?.[mode])||!selected.game.multiplier[mode].every(v=>Number.isFinite(v)&&v>0))throw new Error('Некорректные множители РГС');
    this.multipliers=selected.game.multiplier;this.bets=selected.bets.map(n=>toUnits(n,this.decimals));if(!this.bets.length||this.bets.some(n=>n<=0)||new Set(this.bets).size!==this.bets.length)throw new Error('Invalid RGS stakes');this.wallet(selected);
    const reply=await this.transport.request({get:'options'});this.options(reply);this.wallet(reply);
    const restored=restorePrevious(selected.previous,this.multipliers);
    if(restored){
      // options.bet_sum supplies the stake; total.bet is only the latest debit.
      // Snapshot progress wins over the options counters (which may be defaults).
      this.tiles=restored.tiles;this.level=restored.level;this.charge=restored.charge;
      this.difficulty=restored.difficulty;this.phase='choice';this.starting=false;this.restored=true;
    }
  }
  options(reply){const o=reply.options;if(!o||!this.multipliers[o.level]||!this.bets.includes(toUnits(o.bet_sum,this.decimals)))throw new Error('Некорректные настройки РГС');this.bet=toUnits(o.bet_sum,this.decimals);this.difficulty=o.level;}
  async start(bet,mode){
    if(this.phase==='choice')throw new Error('Раунд ещё идёт');
    if(!this.bets.includes(bet)||!this.multipliers[mode])throw new Error('Ставка или сложность недоступна на РГС');
    const reply=await this.transport.request({set:'options',bet_sum:fromUnits(bet,this.decimals),level:mode});this.options(reply);this.wallet(reply);
    this.level=0;this.charge=0;this.tiles=tower(this.multipliers[this.difficulty]);this.starting=true;this.restored=false;return this.tiles;
  }
  async advance(){
    const reply=await this.transport.request(this.starting?{set:'bet',start:true}:{set:'bet',step:this.level});
    const b=reply.bet;if(!b||b.level!==this.difficulty||typeof b.playing!=='boolean'||(!b.playing&&(b.finished!==true||!Number.isFinite(b.win)||b.win<0)))throw new Error('Некорректный результат РГС');
    let decoded;
    try{decoded=decodeSteps(b,this.tiles,this.level,this.charge,this.decimals);}catch(error){
      // Only game-state data: never log authentication, cookies or launch URLs.
      console.error('RGS_STEP_REJECTED',JSON.stringify({previousStep:this.level,previousCharge:this.charge,bet:b}));
      throw error;
    }
    this.wallet(reply);this.starting=false;this.level=decoded.step;this.charge=decoded.charge;
    this.phase=b.playing?'choice':Number(b.win)>0?'finished':'crashed';return decoded.events;
  }
  async collect(){
    if(this.phase!=='choice')throw new Error('Нет активного раунда');
    const reply=await this.transport.request({set:'bet',finish:true});const b=reply.bet;
    if(b?.finished!==true||b.playing!==false||!Number.isFinite(b.win)||b.win<0)throw new Error('Коллект не подтверждён РГС');
    this.wallet(reply);this.phase='collected';this.charge=0;return toUnits(b.win,this.decimals);
  }
}
