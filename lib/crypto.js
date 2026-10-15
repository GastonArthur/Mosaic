import {randomBytes,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
export const random=()=>randomBytes(32).toString('base64url');
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const challenge=value=>createHash('sha256').update(value).digest('base64url');
function key(){const k=Buffer.from(process.env.TOKEN_ENCRYPTION_KEY||'','base64');if(k.length!==32)throw Error('Configuración de cifrado incompleta.');return k;}
export function seal(value,owner){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(owner));const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');}
export function unseal(value,owner){const b=Buffer.from(value,'base64'),dec=createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));dec.setAAD(Buffer.from(owner));dec.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([dec.update(b.subarray(28)),dec.final()]).toString());}
