import {randomUUID} from 'node:crypto';
import {random,hash,challenge,seal,unseal} from '../lib/crypto.js';
import {validateMessage} from '../lib/media.js';

function env(name){const v=process.env[name];if(!v)throw Error('Falta configurar el servidor. Revisá la guía de instalación.');return v;}
function origin(){return new URL(env('APP_URL')).origin;}
function callback(){return origin()+'/api/action?action=callback';}
async function jsonFetch(url,options={}){const r=await fetch(url,{...options,signal:AbortSignal.timeout(12000)});let data;try{data=await r.json();}catch{data={};}return {r,data};}
async function db(path,method='GET',body,prefer='return=representation'){
 const {r,data}=await jsonFetch(env('SUPABASE_URL')+'/rest/v1/'+path,{method,headers:{apikey:env('SUPABASE_SERVICE_ROLE_KEY'),Authorization:'Bearer '+env('SUPABASE_SERVICE_ROLE_KEY'),'Content-Type':'application/json',Prefer:prefer},body:body===undefined?undefined:JSON.stringify(body)});
 if(!r.ok){const e=Error(r.status===409?'Esta solicitud ya fue procesada; revisá el chat antes de repetir.':'No se pudo guardar o leer la información.');e.status=r.status===409?409:503;throw e;}return data;
}
async function user(req){
 if(!/^Bearer \S+$/.test(req.headers.authorization||''))throw Object.assign(Error('Iniciá sesión.'),{status:401});
 const {r,data}=await jsonFetch(env('SUPABASE_URL')+'/auth/v1/user',{headers:{apikey:env('SUPABASE_ANON_KEY'),Authorization:req.headers.authorization}});
 if(!r.ok||!data.id)throw Object.assign(Error('Tu sesión venció. Iniciá sesión nuevamente.'),{status:401});return data.id;
}
async function exchange(values){const {r,data}=await jsonFetch('https://id.kick.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...values,client_id:env('KICK_CLIENT_ID'),client_secret:env('KICK_CLIENT_SECRET')})});if(!r.ok||!data.access_token||!Number.isFinite(Number(data.expires_in)))throw Error('Kick no autorizó la conexión. Volvé a conectar la cuenta.');return data;}
async function kick(path,token,options={}){const {r,data}=await jsonFetch('https://api.kick.com/public/v1/'+path,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}});if(!r.ok)throw Error(r.status===429?'Kick pide esperar antes de enviar.':r.status===401?'Reconectá la cuenta de Kick.':`Kick rechazó la solicitud (${r.status}).`);return data;}
const accountFilter=(owner,id)=>`owner_id=eq.${encodeURIComponent(owner)}&id=eq.${encodeURIComponent(id)}`;
function cookie(value,maxAge){return `mw_oauth=${value}; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=${maxAge}`;}
function bodyOf(req){const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};if(JSON.stringify(b).length>10000)throw Error('Solicitud demasiado grande.');return b;}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 const action=new URL(req.url,'https://local').searchParams.get('action');
 const reply=(status,data)=>res.status(status).json(data);
 try{
  if(action==='config'&&req.method==='GET'){
   const required=['APP_URL','SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','KICK_CLIENT_ID','KICK_CLIENT_SECRET','TOKEN_ENCRYPTION_KEY'];
   const configured=required.every(k=>!!process.env[k]);return reply(200,configured?{configured:true,url:env('SUPABASE_URL'),key:env('SUPABASE_ANON_KEY')}:{configured:false});
  }
  if(action==='callback'&&req.method==='GET'){
   try{
    const u=new URL(req.url,origin()),state=u.searchParams.get('state')||'',binding=(req.headers.cookie||'').match(/(?:^|;\s*)mw_oauth=([^;]+)/)?.[1];
    if(!binding||!state||u.searchParams.has('error')||!u.searchParams.get('code'))throw Error('Autorización cancelada o vencida.');
    // Atomic delete consumes the state exactly once, bound to the browser that initiated it.
    const rows=await db(`mw_oauth?state_hash=eq.${hash(state)}&binding_hash=eq.${hash(binding)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,'DELETE');
    const record=rows[0];if(!record)throw Error('Autorización vencida.');
    const token=await exchange({grant_type:'authorization_code',code:u.searchParams.get('code'),redirect_uri:callback(),code_verifier:unseal(record.verifier,record.owner_id)});
    if(!String(token.scope||'').split(/\s+/).includes('chat:write'))throw Error('Falta permiso de chat.');
    const profile=(await kick('users',token.access_token)).data?.[0];if(!profile?.user_id||!profile.name)throw Error('Perfil inválido.');
    const credentials=seal({access:token.access_token,refresh:token.refresh_token,expires:Date.now()+Number(token.expires_in)*1000},record.owner_id);
    const existing=await db(`mw_accounts?owner_id=eq.${record.owner_id}&kick_id=eq.${encodeURIComponent(String(profile.user_id))}&select=id`);
    let saved;
    if(existing.length){saved=await db('mw_accounts?'+accountFilter(record.owner_id,existing[0].id)+'&or=(lease_until.is.null,lease_until.lt.'+encodeURIComponent(new Date().toISOString())+')','PATCH',{name:profile.name,credentials});if(!saved.length)throw Error('Cuenta ocupada.');}
    else saved=await db('mw_accounts','POST',{owner_id:record.owner_id,kick_id:String(profile.user_id),name:profile.name,credentials});
    res.setHeader('Set-Cookie',cookie('',0));return res.redirect(303,origin()+'/?connected='+saved[0].id);
   }catch{res.setHeader('Set-Cookie',cookie('',0));return res.redirect(303,origin()+'/?connection=failed');}
  }
  if(!['accounts','connect','disconnect','send'].includes(action))return reply(404,{error:'Ruta no encontrada.'});
  if(req.method!==(action==='accounts'?'GET':'POST'))return reply(405,{error:'Método no permitido.'});
  if(req.method==='POST'&&req.headers.origin!==origin())return reply(403,{error:'Origen no permitido.'});
  const owner=await user(req),body=bodyOf(req);
  if(action==='accounts')return reply(200,{accounts:await db(`mw_accounts?owner_id=eq.${owner}&select=id,name,kick_id&order=name`)});
  if(action==='connect'){
   const state=random(),binding=random(),verifier=random();
   await db(`mw_oauth?owner_id=eq.${owner}`,'DELETE');
   await db('mw_oauth','POST',{state_hash:hash(state),owner_id:owner,binding_hash:hash(binding),verifier:seal(verifier,owner),expires_at:new Date(Date.now()+600000).toISOString()});
   const u=new URL('https://id.kick.com/oauth/authorize');u.search=new URLSearchParams({response_type:'code',client_id:env('KICK_CLIENT_ID'),redirect_uri:callback(),scope:'user:read channel:read chat:write',state,code_challenge:challenge(verifier),code_challenge_method:'S256'}).toString();res.setHeader('Set-Cookie',cookie(binding,600));return reply(200,{url:u.href});
  }
  if(action==='disconnect'){
   if(!/^[0-9a-f-]{36}$/i.test(body.accountId||''))return reply(400,{error:'Cuenta inválida.'});
   const removed=await db('mw_accounts?'+accountFilter(owner,body.accountId)+'&or=(lease_until.is.null,lease_until.lt.'+encodeURIComponent(new Date().toISOString())+')','DELETE');
   if(!removed.length)return reply(409,{error:'Cuenta no disponible u ocupada; esperá antes de desvincular.'});return reply(200,{ok:true});
  }
  const message=validateMessage(body),lease=randomUUID();
  const accounts=await db('rpc/mw_acquire','POST',{p_owner:owner,p_account:message.accountId,p_lease:lease});
  if(!accounts.length)return reply(409,{error:'Cuenta no disponible o enviando. Esperá unos segundos.'});
  const account=accounts[0],filter=accountFilter(owner,account.id)+'&lease_id=eq.'+lease;
  let claimed=false,attempted=false;
  try{
   await db('mw_receipts','POST',{owner_id:owner,request_id:message.requestId,status:'pending'});claimed=true;
   let token=unseal(account.credentials,owner);
   if(token.expires<Date.now()+60000){const fresh=await exchange({grant_type:'refresh_token',refresh_token:token.refresh});token={access:fresh.access_token,refresh:fresh.refresh_token||token.refresh,expires:Date.now()+Number(fresh.expires_in)*1000};const saved=await db('mw_accounts?'+filter,'PATCH',{credentials:seal(token,owner)});if(!saved.length)throw Error('La cuenta cambió. Volvé a intentar.');}
   const channel=(await kick('channels?slug='+encodeURIComponent(message.channel),token.access)).data?.[0]?.broadcaster_user_id;
   if(!channel)throw Error('Canal no encontrado.');
   attempted=true;
   const result=await kick('chat',token.access,{method:'POST',body:JSON.stringify({broadcaster_user_id:channel,type:'user',content:message.content})});
   if(!result.data?.is_sent)throw Error('Kick no confirmó el envío.');
   await db(`mw_receipts?owner_id=eq.${owner}&request_id=eq.${message.requestId}`,'PATCH',{status:'sent'}).catch(()=>{});
   return reply(200,{sent:true,messageId:result.data.message_id});
  }catch(e){if(claimed)await db(`mw_receipts?owner_id=eq.${owner}&request_id=eq.${message.requestId}`,'PATCH',{status:attempted?'unknown':'failed'}).catch(()=>{});if(attempted)return reply(502,{error:'No se pudo confirmar el envío. Revisá el chat de Kick antes de volver a enviar.',uncertain:true});throw e;}
  finally{await db('mw_accounts?'+filter,'PATCH',{lease_id:null,lease_until:null}).catch(()=>{});}
 }catch(e){return reply(e.status||400,{error:['AbortError','TimeoutError','TypeError'].includes(e.name)?'No se pudo contactar al servicio. Intentá nuevamente.':e.message||'No se pudo completar la solicitud.'});}
}
