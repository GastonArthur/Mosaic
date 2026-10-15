import {test,expect} from '@playwright/test';
test('12 persistent players, account selection, send, TikTok switch and reload',async({page})=>{
 const sent=[];
 const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',email:'test@example.test',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
 await page.route('**/api/action?*',async route=>{const req=route.request(),action=new URL(req.url()).searchParams.get('action');let data={};if(action==='config')data={configured:true,url:'https://project.supabase.co',key:'public'};if(action==='accounts')data={accounts:[{id:'22222222-2222-4222-8222-222222222222',name:'Cuenta Uno'}]};if(action==='send'){sent.push(req.postDataJSON());data={sent:true};}await route.fulfill({json:data});});
 await page.route('https://project.supabase.co/**',route=>route.fulfill({json:{access_token:'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEiLCJleHAiOjQxMDI0NDQ4MDB9.signature',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user}}));
 await page.route('https://player.kick.com/**',route=>route.fulfill({contentType:'text/html',body:'<body style="background:#192518;color:#e2eedd;font:18px sans-serif;padding:25px">Reproductor de prueba · Kick</body>'}));
 await page.route('https://www.tiktok.com/player/**',route=>route.fulfill({contentType:'text/html',body:'<body>TikTok fixture</body>'}));
 await page.goto('/');await page.getByLabel('Email',{exact:true}).fill('test@example.test');await page.getByLabel('Contraseña',{exact:true}).fill('password');await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.locator('.card')).toHaveCount(1);
 for(let i=1;i<12;i++)await page.getByRole('button',{name:'+ Agregar pestaña',exact:true}).click();
 await expect(page.locator('iframe')).toHaveCount(12);await expect(page.getByRole('button',{name:'+ Agregar pestaña',exact:true})).toBeDisabled();
 const first=page.locator('.card').first();await first.getByLabel('Cuenta para enviar').selectOption('22222222-2222-4222-8222-222222222222');await first.getByLabel('Mensaje',{exact:true}).fill('Hola desde prueba');await first.getByRole('button',{name:'Enviar',exact:true}).click();await expect(first.locator('.card-status')).toContainText('Enviado como Cuenta Uno');expect(sent).toHaveLength(1);expect(sent[0].channel).toBe('redondofrann');
 await page.screenshot({path:'test-results/mosaico-desktop.png',fullPage:true});
 await page.locator('#link').fill('https://www.tiktok.com/@scout2015/video/6718335390845095173');await page.getByRole('button',{name:'Abrir en todas'}).click();await expect(page.locator('iframe[src*="tiktok.com"]')).toHaveCount(12,{timeout:10000});await expect(first.getByRole('button',{name:'Enviar',exact:true})).toBeDisabled();
 await page.reload();await expect(page.locator('.card')).toHaveCount(12);await expect(page.locator('iframe')).toHaveCount(12,{timeout:10000});await expect(page.locator('.card').first().getByLabel('Cuenta para enviar')).toHaveValue('22222222-2222-4222-8222-222222222222');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/mosaico-mobile.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
