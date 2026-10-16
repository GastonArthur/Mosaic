// One timer per card. Never catch up missed intervals or retry uncertain sends.
export function createScheduler({send,changed,setTimer=setTimeout,clearTimer=clearTimeout,now=Date.now}){
 let timer,run=0,active=false,nextAt=null;
 function stop(){run++;active=false;nextAt=null;clearTimer(timer);changed(false);}
 function start(seconds){
  if(!Number.isFinite(seconds)||seconds<5||seconds>86400)throw Error('Elegí entre 5 y 86400 segundos.');
  clearTimer(timer);run++;active=true;const generation=run;nextAt=now()+seconds*1000;changed(true);
  const tick=async()=>{
   if(!active||generation!==run)return;
   nextAt=null;
   try{await send();}catch(error){if(generation===run){stop();changed(false,error);}return;}
   if(active&&generation===run){nextAt=now()+seconds*1000;timer=setTimer(tick,seconds*1000);}
  };
  timer=setTimer(tick,seconds*1000);
 }
 return {start,stop,get active(){return active;},get remaining(){return nextAt===null?null:Math.max(0,Math.ceil((nextAt-now())/1000));}};
}
