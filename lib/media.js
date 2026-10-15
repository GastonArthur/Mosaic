export function parseMedia(input){
 const value=String(input||'').trim();
 if(/^[a-zA-Z0-9_-]{1,25}$/.test(value))return {kind:'kick',id:value.toLowerCase(),url:`https://kick.com/${value.toLowerCase()}`};
 let u;try{u=new URL(/^https?:\/\//i.test(value)?value:`https://${value}`);}catch{throw Error('Ingresá un canal de Kick o un enlace de video de TikTok.');}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port)throw Error('Enlace inválido.');
 if(['kick.com','www.kick.com'].includes(u.hostname)&&/^\/[a-zA-Z0-9_-]{1,25}\/?$/.test(u.pathname))return parseMedia(u.pathname.split('/')[1]);
 if(['www.tiktok.com','tiktok.com'].includes(u.hostname)){
  const match=u.pathname.match(/^\/@[^/]+\/(?:video|photo)\/(\d{10,25})\/?$/)||u.pathname.match(/^\/player\/v1\/(\d{10,25})\/?$/);
  if(match)return {kind:'tiktok',id:match[1],url:`https://www.tiktok.com${u.pathname}`};
 }
 throw Error('Usá el enlace completo del video de TikTok (/@usuario/video/…). Para Kick, usá el nombre del canal.');
}
export function embedUrl(media){return media.kind==='kick'?`https://player.kick.com/${media.id}?autoplay=true&muted=true`:`https://www.tiktok.com/player/v1/${media.id}?autoplay=1&controls=1&loop=1`;}
export function validateMessage(body){
 if(!body||typeof body.content!=='string'||!body.content.trim())throw Error('Escribí un mensaje.');
 const content=body.content.trim();
 if([...new Intl.Segmenter('es',{granularity:'grapheme'}).segment(content)].length>500||new TextEncoder().encode(content).length>2048)throw Error('El mensaje supera el límite de Kick.');
 if(!/^[a-z0-9_-]{1,25}$/.test(body.channel||''))throw Error('Canal inválido.');
 for(const field of ['accountId','requestId'])if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body[field]||''))throw Error('Solicitud inválida.');
 return {...body,content};
}
