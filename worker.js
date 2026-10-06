import {DemoGame,MULTIPLIERS} from './game.mjs';
import {RgsGame,RgsTransport} from './rgs.mjs';
import {toUnits,formatUnits} from './money.mjs';
import {Stats,seeded,validate,playRound} from './core.mjs';
let running=false,stop=false,rows,completed=0,config,decimals=2,currency='FUN',stats,points=[],socket;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const money=v=>formatUnits(v,decimals,false);
function report(state,error){const shown=points.slice();if(stats&&completed&&shown.at(-1)?.[0]!==completed)shown.push([completed,stats.snapshot().rtp,stats.balance]);postMessage({type:'progress',state,error,stats:stats?.snapshot(),points:shown,decimals,currency,completed,total:config?.rounds});}
async function run(c){
 if(running)return;running=true;stop=false;completed=0;points=[];stats=null;config=c;decimals=2;currency='FUN';
 try{
  validate(c);rows=new Float64Array(c.rounds*8);let game,stake;
  if(c.source==='rgs'){
   if(!c.virtualConfirmed||new URL(c.location.href).searchParams.get('rgs')!=='test')throw Error('Нужно подтверждение виртуальных средств и rgs=test');
   report('Подключение к тестовому RGS');socket=new WebSocket('wss://dev.skyline-api.net/wss');
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.close();reject(Error('Таймаут подключения'));},12000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('WebSocket недоступен'));},{once:true});});
   const transport=new RgsTransport(socket);let last=0;
   game=new RgsGame({request:async req=>{await sleep(Math.max(0,Math.max(30,c.delay)-(Date.now()-last)));const reply=await transport.request(req);last=Date.now();return reply;}});
   await game.connect(c.location);decimals=game.decimals;currency=game.currency;
   if(game.restored)throw Error('Есть незавершённый раунд. Завершите его в игре перед новым тестом.');
   stake=toUnits(c.bet,decimals);if(!game.bets.includes(stake))throw Error('Ставка недоступна. Допустимые: '+game.bets.map(money).join(', '));
  }else{game=new DemoGame(seeded(c.seed));game.balance=toUnits(c.balance,2);stake=toUnits(c.bet,2);if(stake<100||stake>10000)throw Error('Локальная ставка должна быть от 1 до 100 FUN');}
  stats=new Stats(game.balance,c.large);const stride=Math.max(1,Math.ceil(c.rounds/1000));let lastReport=0;
  for(let i=0;i<c.rounds&&!stop;i++){
   if(game.balance<stake)throw Error('Недостаточно баланса для следующего раунда');
   const r=await playRound(game,stake,c.mode,c.step);stats.add(r);rows.set([i+1,r.stake,r.payout,r.balance,r.step,r.crash?.multiplier??0,r.dash,r.multiplier],i*8);completed++;
   if(completed%stride===0||completed===c.rounds)points.push([completed,stats.snapshot().rtp,r.balance]);
   if(Date.now()-lastReport>200){report('Выполняется');lastReport=Date.now();await sleep(0);}
   if(c.source==='local'&&c.delay)await sleep(c.delay);
  }
  report(stop?'Остановлен после завершённого раунда':'Завершён');
 }catch(e){report('Остановлен: ошибка',e.message+' Завершённые раунды сохранены; неполный раунд не включён в RTP. Повтор команд автоматически не выполняется.');}
 finally{socket?.close();socket=null;running=false;postMessage({type:'done'});}
}
onmessage=({data:d})=>{
 if(d.type==='start')void run(d.config);
 if(d.type==='stop')stop=true;
 if(d.type==='page')postMessage({type:'page',page:d.page,rows:Array.from(rows?.slice(d.page*50*8,Math.min(completed,(d.page+1)*50)*8)??[]),completed});
 if(d.type==='export'&&!running){
  postMessage({type:'csv-start'});
  postMessage({type:'csv-part',text:'\uFEFFsource,currency,difficulty,target_step,seed,round,stake,payout,balance_after,step,crash_step_multiplier,dash_count,cashout_multiplier\n'});
  for(let i=0;i<completed;i+=5000){let out='';for(let j=i;j<Math.min(i+5000,completed);j++){const a=rows.subarray(j*8,j*8+8);out+=[config.source,currency,config.mode,config.step,config.source==='local'?config.seed:'',a[0],money(a[1]),money(a[2]),money(a[3]),a[4],a[5]||'',a[6],a[7]||''].map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')+'\n';}postMessage({type:'csv-part',text:out});}
  postMessage({type:'csv-end'});
 }
};
