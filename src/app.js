import {createClient} from '@supabase/supabase-js';
import {parseMedia,embedUrl} from '../lib/media.js';
import './style.css';
import {createScheduler} from './scheduler.js';
const root=document.querySelector('#app');
const el=(tag,attrs={},text)=>{const n=document.createElement(tag);for(const [k,v]of Object.entries(attrs)){if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else n.setAttribute(k,v);}if(text!==undefined)n.textContent=text;return n;};
const button=(text,fn,cls='secondary')=>el('button',{type:'button',class:cls,onclick:fn},text);
let supabase,session,accounts=[],cards=[],target='redondofrann',grid,notice,accountPanel,adding,loadGeneration=0;
const pending=new Set();
function notify(text){if(notice)notice.textContent=text;}
function storageKey(){return 'mosaico-web:'+session.user.id;}
function save(){try{localStorage.setItem(storageKey(),JSON.stringify({cards:cards.map(({id,url,accountId,name,autoText,autoSeconds})=>({id,url,accountId,name,autoText,autoSeconds})),target,size:grid?.dataset.size||'normal'}));}catch{notify('No se pudo guardar el mosaico en este navegador.');}}
async function api(action,body){const {data}=await supabase.auth.getSession();if(!data.session)throw Error('Iniciá sesión nuevamente.');const r=await fetch('/api/action?action='+action,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+data.session.access_token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const result=await r.json();if(!r.ok)throw Error(result.error||'Error del servidor.');return result;}
function frame(card){
 const media=parseMedia(card.url),f=el('iframe',{title:`${card.name}: ${media.kind} ${media.id}`,src:embedUrl(media),allow:'autoplay; fullscreen; picture-in-picture',allowfullscreen:'',referrerpolicy:'strict-origin-when-cross-origin'});
 f.addEventListener('load',()=>{card.status.textContent='Si no reproduce, presioná Play dentro del video.';});
 card.frame?.remove();card.frame=f;card.player.append(f);card.media=media;
 card.chatPanel.hidden=media.kind!=='kick';
 if(media.kind==='kick'){
  const chatUrl='https://kick.com/popout/'+media.id+'/chat';
  if(card.chatFrame.getAttribute('src')!==chatUrl)card.chatFrame.src=chatUrl;
 }else card.chatFrame.removeAttribute('src');
 card.external.href=media.url;card.badge.textContent=media.kind.toUpperCase();
 card.send.disabled=media.kind!=='kick'||!card.accountId||pending.has(card.id);card.textarea.disabled=media.kind!=='kick';
 card.textarea.placeholder=media.kind==='kick'?'Mensaje para este canal…':'El chat de cuentas está disponible en Kick.';
}
function refreshSelect(card){const selected=card.accountId;card.select.replaceChildren(el('option',{value:''},'Seleccionar cuenta'));for(const a of accounts)card.select.append(el('option',{value:a.id},a.name));card.select.value=accounts.some(a=>a.id===selected)?selected:'';card.accountId=card.select.value;card.send.disabled=card.media?.kind!=='kick'||!card.accountId;}
async function connect(card){try{if(pending.size)throw Error('Esperá a que termine el envío antes de conectar otra cuenta.');if(card)sessionStorage.setItem('mosaico-connect-card',card.id);else sessionStorage.removeItem('mosaico-connect-card');notify('Abriendo la autorización de Kick…');const {url}=await api('connect',{});window.location.assign(url);}catch(e){notify(e.message);}}
function mountCard(card,index){
 const article=el('article',{class:'card'}),head=el('header',{class:'card-head'});card.article=article;
 const name=el('input',{class:'card-name',value:card.name,maxlength:'40','aria-label':'Nombre de la tarjeta',onchange:e=>{card.name=e.target.value.trim()||'Pestaña';e.target.value=card.name;save();}});
 card.badge=el('span',{class:'badge'},'');
 const remove=button('×',()=>{if(pending.has(card.id))return notify('Esperá a que termine el envío.');card.scheduler.stop();clearTimeout(card.timer);article.remove();cards=cards.filter(c=>c!==card);save();updateCount();});remove.setAttribute('aria-label','Quitar '+card.name);
 head.append(name,card.badge,remove);
 card.player=el('div',{class:'player'});card.status=el('p',{class:'card-status','aria-live':'polite'},'Preparando reproductor…');
 const tools=el('div',{class:'tools'});card.external=el('a',{target:'_blank',rel:'noopener noreferrer'},'Abrir en origen ↗');tools.append(button('Recargar',()=>frame(card)),card.external);
 card.chatPanel=el('section',{class:'live-chat','aria-label':'Chat del canal'});
 card.chatFrame=el('iframe',{title:'Chat de '+card.name,sandbox:'allow-scripts allow-same-origin',referrerpolicy:'strict-origin-when-cross-origin'});
 const chatHead=el('div',{class:'live-chat-head'});chatHead.append(el('strong',{},'Chat en vivo'),button('Recargar chat',()=>{if(card.chatFrame.hasAttribute('src'))card.chatFrame.src=card.chatFrame.src;}));
 const chatViewport=el('div',{class:'chat-viewport'});chatViewport.append(card.chatFrame);
 card.chatPanel.append(chatHead,chatViewport,el('p',{class:'chat-note'},'Para escribir con tu cuenta seleccionada, usá el formulario de abajo. Podés ajustar la altura desde la esquina del chat.'));
 const form=el('form',{class:'chat'});card.select=el('select',{'aria-label':'Cuenta para enviar',onchange:()=>{card.scheduler.stop();card.accountId=card.select.value;refreshSelect(card);save();}});
 card.textarea=el('textarea',{rows:'2','aria-label':'Mensaje',maxlength:'1000'});card.send=el('button',{type:'submit',class:'primary'},'Enviar');
 const connectButton=button('Conectar cuenta',()=>connect(card));
 form.addEventListener('submit',async e=>{e.preventDefault();if(pending.has(card.id)||!card.accountId||card.media.kind!=='kick')return;const content=card.textarea.value;if(!content.trim())return;
  const accountId=card.accountId,channel=card.media.id;pending.add(card.id);card.send.disabled=true;card.select.disabled=true;card.textarea.disabled=true;card.status.textContent='Enviando…';
  try{await api('send',{accountId,channel,content,requestId:crypto.randomUUID()});card.textarea.value='';card.status.textContent='Enviado como '+(accounts.find(a=>a.id===accountId)?.name||'tu cuenta')+'.';}
  catch(error){card.scheduler.stop();card.status.textContent=error.message;}
  finally{pending.delete(card.id);card.select.disabled=false;card.textarea.disabled=card.media.kind!=='kick';card.send.disabled=card.media.kind!=='kick'||!card.accountId;}
 });
 form.append(card.select,connectButton,card.textarea,card.send);article.append(head,card.player,tools,card.chatPanel,form,automation(card),card.status);grid.append(article);
 card.media=parseMedia(card.url);refreshSelect(card);
 card.timer=setTimeout(()=>{if(article.isConnected)frame(card);},index*350);
}
function automation(card){
 const details=el('details',{class:'automation'}),summary=el('summary',{},'Mensaje automático');
 const text=el('textarea',{'aria-label':'Mensaje automático',rows:'2',maxlength:'1000',placeholder:'Mensaje que se repetirá…'});text.value=card.autoText||'';
 const seconds=el('input',{type:'number',min:'5',max:'86400',step:'1',value:String(card.autoSeconds||60),'aria-label':'Intervalo en segundos'});
 const state=el('p',{class:'auto-status','aria-live':'polite'},'Pausado'),toggle=button('Iniciar',()=>{
  if(card.scheduler.active){card.scheduler.stop();return;}
  if(!navigator.onLine||!card.accountId||card.media?.kind!=='kick'||!text.value.trim()){state.textContent='Elegí una cuenta de Kick y escribí el mensaje; necesitás conexión.';return;}
  if(!seconds.checkValidity()){seconds.reportValidity();return;}
  if(!navigator.locks){state.textContent='Usá Chrome o Edge actualizado para programar mensajes.';return;}
  card.autoText=text.value.trim();card.autoSeconds=Number(seconds.value);save();
  const owner=session.user.id;
  navigator.locks.request('mosaico-auto:'+owner+':'+card.id,{ifAvailable:true},async lock=>{
   if(!lock){state.textContent='Este temporizador ya está activo en otra pestaña.';return;}
   if(!card.article.isConnected||owner!==session?.user.id)return;
   await new Promise(resolve=>{card.releaseAuto=resolve;card.scheduler.start(card.autoSeconds);});
  }).catch(()=>{card.scheduler.stop();state.textContent='No se pudo iniciar el temporizador.';});
 });
 card.scheduler=createScheduler({send:async()=>{
  if(!navigator.onLine||!card.article.isConnected)throw Error('Sin conexión. Reiniciá cuando estés listo.');
  if(pending.has(card.id))return;
  const accountId=card.accountId,channel=card.media.id;
  pending.add(card.id);card.send.disabled=true;card.select.disabled=true;
  try{await api('send',{accountId,channel,content:card.autoText,requestId:crypto.randomUUID()});state.textContent='Último envío: '+new Date().toLocaleTimeString()+'. Próximo en '+card.autoSeconds+' s.';}
  finally{pending.delete(card.id);card.select.disabled=false;card.send.disabled=card.media?.kind!=='kick'||!card.accountId;}
 },changed:(active,error)=>{
  toggle.textContent=active?'Pausar':'Iniciar';text.disabled=seconds.disabled=active;
  state.textContent=active?'Activo · primer envío en '+card.autoSeconds+' s.':error?'Pausado: '+error.message:'Pausado';
  if(!active){card.releaseAuto?.();card.releaseAuto=null;}
 }});
 for(const field of [text,seconds])field.addEventListener('change',()=>{card.autoText=text.value;card.autoSeconds=Number(seconds.value)||60;save();});
 details.append(summary,text,el('span',{},'Intervalo (segundos)'),seconds,toggle,state,el('small',{},'Funciona con esta página abierta. Al recargar queda pausado. El navegador puede retrasar envíos en segundo plano.'));
 return details;
}
function updateCount(){document.querySelector('#count').textContent=`${cards.length} / 12 pestañas`;adding.disabled=cards.length>=12;}
function addCard(){try{if(cards.length>=12)return;const media=parseMedia(target);const card={id:crypto.randomUUID(),name:`Pestaña ${cards.length+1}`,url:media.url,accountId:''};cards.push(card);mountCard(card,0);save();updateCount();}catch(e){notify(e.message);}}
function paintAccounts(){accountPanel.replaceChildren(el('h2',{},'Cuentas de Kick'));if(!accounts.length)accountPanel.append(el('p',{},'Conectá una cuenta y elegila en la tarjeta desde la que querés escribir.'));
 for(const a of accounts){const row=el('div',{class:'account-row'});row.append(el('strong',{},a.name),button('Desvincular',async()=>{if(!confirm(`¿Desvincular ${a.name} de esta web? No cierra su sesión en el .exe.`))return;try{await api('disconnect',{accountId:a.id});accounts=accounts.filter(x=>x.id!==a.id);for(const c of cards)refreshSelect(c);save();paintAccounts();}catch(e){notify(e.message);}}));accountPanel.append(row);}
 accountPanel.append(el('p',{class:'hint'},'Para conectar otra cuenta, cambiá de usuario en Kick antes de autorizar. Reautorizar la misma cuenta actualiza su conexión, no crea otra.'));
}
function dashboard(){
 root.replaceChildren();const top=el('header',{class:'topbar'});top.append(el('a',{class:'brand',href:'/'},'mosaico.'),el('span',{class:'edition'},'WEB / KICK + TIKTOK'),button('Salir',async()=>{if(pending.size)return notify('Esperá a que termine el envío.');await supabase.auth.signOut();}));
 const main=el('main'),heading=el('div',{class:'heading'}),intro=el('div');intro.append(el('p',{class:'eyebrow'},'TU MOSAICO, EN EL NAVEGADOR'),el('h1',{},'Todas tus pestañas.\nUn mismo lugar.'),el('p',{},'Hasta 12 reproductores abiertos y una cuenta de Kick elegida en cada tarjeta.'));
 adding=button('+ Agregar pestaña',addCard,'primary');heading.append(intro,adding);notice=el('p',{class:'notice',role:'status','aria-live':'polite'});
 const bar=el('form',{class:'channel-bar'}),label=el('label',{for:'link'},'CANAL DE KICK O VIDEO DE TIKTOK'),input=el('input',{id:'link',placeholder:'kick.com/canal o tiktok.com/@usuario/video/…',required:''});
 const submit=el('button',{class:'primary',type:'submit'},'Abrir en todas ↗');bar.append(label,input,submit);bar.addEventListener('submit',e=>{e.preventDefault();if(pending.size)return notify('Esperá a que termine el envío antes de cambiar el canal.');try{const media=parseMedia(input.value);target=media.url;input.value=target;cards.forEach((card,i)=>{card.scheduler.stop();card.url=target;clearTimeout(card.timer);card.timer=setTimeout(()=>{if(card.article.isConnected)frame(card);},i*250);});save();notify('Enlace aplicado. Las 12 permanecen abiertas; el navegador puede pedir que presiones Play.');}catch(error){notify(error.message);}});
 const info=el('p',{class:'info'},'Los reproductores muestran el video. La cuenta seleccionada se usa para enviar mensajes por la API de Kick. Tus sesiones del .exe no se modifican.');
 const controls=el('div',{class:'controls'});controls.append(el('h2',{id:'count'},''),button('Conectar cuenta de Kick',()=>connect()));
 const size=el('select',{'aria-label':'Tamaño de las tarjetas',onchange:()=>{grid.dataset.size=size.value;save();}});for(const [value,label] of [['normal','Normal'],['compact','Compacto'],['mini','Mini']])size.append(el('option',{value},label));controls.append(size);
 grid=el('section',{class:'grid','aria-label':'Reproductores'});accountPanel=el('section',{class:'accounts'});
 main.append(heading,bar,notice,info,controls,grid,accountPanel,el('footer',{},'Mosaico web · Videos servidos por Kick y TikTok. Su disponibilidad y reproducción dependen de cada plataforma.'));
 root.append(top,main);
 try{const stored=JSON.parse(localStorage.getItem(storageKey())||'{}');grid.dataset.size=['normal','compact','mini'].includes(stored.size)?stored.size:'normal';size.value=grid.dataset.size;target=parseMedia(stored.target||'redondofrann').url;cards=(stored.cards||[]).slice(0,12).filter(c=>{try{parseMedia(c.url);return typeof c.id==='string'&&typeof c.name==='string';}catch{return false;}}).map(c=>({id:c.id,name:c.name.slice(0,40),url:c.url,accountId:c.accountId||'',autoText:typeof c.autoText==='string'?c.autoText.slice(0,1000):'',autoSeconds:Number(c.autoSeconds)||60}));}catch{cards=[];target='redondofrann';}
 if(!cards.length)cards=[{id:crypto.randomUUID(),name:'Pestaña 1',url:parseMedia(target).url,accountId:''}];
 input.value=target;cards.forEach(mountCard);updateCount();paintAccounts();
 const params=new URLSearchParams(location.search),connected=params.get('connected');
 if(connected){const id=sessionStorage.getItem('mosaico-connect-card'),card=cards.find(c=>c.id===id);if(card&&accounts.some(a=>a.id===connected)){card.accountId=connected;refreshSelect(card);save();}sessionStorage.removeItem('mosaico-connect-card');notify('Cuenta vinculada. Elegila en la tarjeta correspondiente.');}
 if(params.get('connection')==='failed')notify('No se pudo conectar Kick. Reintentá y aceptá el permiso para enviar mensajes.');
 history.replaceState({},'',location.pathname);
}
function login(){root.replaceChildren();const box=el('main',{class:'login'});box.append(el('span',{class:'brand'},'mosaico.'),el('h1',{},'Tu espacio privado.'),el('p',{},'Ingresá con tu usuario de Mosaico (Supabase). Después podés vincular tus cuentas de Kick.'));
 const form=el('form'),email=el('input',{type:'email',autocomplete:'username',placeholder:'Email',required:'','aria-label':'Email'}),password=el('input',{type:'password',autocomplete:'current-password',placeholder:'Contraseña',required:'','aria-label':'Contraseña'}),submit=el('button',{class:'primary',type:'submit'},'Entrar'),error=el('p',{role:'alert'});
 form.append(email,password,submit,error);form.addEventListener('submit',async e=>{e.preventDefault();submit.disabled=true;try{const {error:e}=await supabase.auth.signInWithPassword({email:email.value,password:password.value});if(e)throw e;}catch{error.textContent='No se pudo ingresar. Revisá el email y la contraseña.';}finally{submit.disabled=false;}});box.append(form);root.append(box);
}
async function loadSession(next){const generation=++loadGeneration;if(next?.user.id===session?.user.id&&grid?.isConnected){session=next;return;}cards.forEach(c=>{c.scheduler?.stop();clearTimeout(c.timer);});session=next;accounts=[];cards=[];grid=null;if(!next)return login();root.replaceChildren(el('main',{},'Cargando tus cuentas…'));try{const result=await api('accounts');if(generation!==loadGeneration)return;accounts=result.accounts;dashboard();}catch(e){if(generation!==loadGeneration)return;root.replaceChildren(el('main',{class:'login'},e.message));root.firstChild.append(button('Reintentar',()=>{session=null;loadSession(next);}),button('Salir',()=>supabase.auth.signOut()));}}
window.addEventListener('message',e=>{if(e.origin!=='https://www.tiktok.com'||!e.data?.['x-tiktok-player'])return;const card=cards.find(c=>c.frame?.contentWindow===e.source);if(!card)return;if(e.data.type==='onPlayerReady')card.frame.contentWindow.postMessage({'x-tiktok-player':true,type:'mute'},'https://www.tiktok.com');if(e.data.type==='onPlayerError')card.status.textContent='TikTok no pudo reproducir este video. Probá Play o Abrir en origen.';});
window.addEventListener('offline',()=>{cards.forEach(c=>c.scheduler.stop());notify('Sin conexión. Los temporizadores se pausaron.');});
try{const config=await (await fetch('/api/action?action=config')).json();if(!config.configured){root.append(el('main',{class:'login'},'Mosaico está listo para configurar. Completá las variables de Vercel y ejecutá supabase.sql siguiendo README.md.'));}else{supabase=createClient(config.url,config.key);supabase.auth.onAuthStateChange((_event,next)=>{setTimeout(()=>loadSession(next),0);});}}catch{root.append(el('main',{class:'login'},'No se pudo conectar al servidor. Recargá la página.'));}
