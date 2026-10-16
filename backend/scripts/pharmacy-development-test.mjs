import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import {patientDemoUI,pharmacistReviewUI,productPageUI} from './pharmacy-real-ui-helpers.mjs';
import {ensureCareSchema} from '../services/careSchema.js';
const port=5022,tag='pharmacy-dev-test-'+Date.now(),users=[],products=[],password='pharmacy-fixture-password';let server,productionServer;
async function api(path,user,method='GET',body){const r=await fetch('http://127.0.0.1:'+port+'/api'+path,{method,headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+user.token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});return{status:r.status,data:await r.json()};}
try{
 await ensureCareSchema();const [adminRow]=await pool.query("INSERT INTO users(name,email,password,role) VALUES(?,?,?,'admin')",[tag,tag+'@example.com',await bcrypt.hash(password,10)]);users.push(adminRow.insertId);
 server=spawn(process.execPath,['server.js'],{cwd:new URL('../',import.meta.url),windowsHide:true,stdio:'pipe',env:{...process.env,PORT:String(port),NODE_ENV:'development',PHARMACY_DEMO_ENABLED:'true',PHARMACY_ENABLED:'false',PHARMACY_AUTHORIZED:'false',PHARMACY_COD_ENABLED:'false',PHARMACY_REVIEWER_IDS:String(adminRow.insertId),MEDICINE_WORKER_ENABLED:'false',CARE_MAINTENANCE_ENABLED:'false'}});let logs='';server.stderr.on('data',b=>{logs+=b;});server.stdout.on('data',()=>{});
 for(let i=0;i<100;i++){try{if((await api('/health')).status===200)break;}catch{}if(server.exitCode!==null)throw new Error(logs);await new Promise(r=>setTimeout(r,100));}
 const admin=(await api('/auth/login',null,'POST',{email:tag+'@example.com',password})).data;
 async function patient(suffix){const r=await api('/auth/register',null,'POST',{name:tag,email:tag+'-'+suffix+'@example.com',password});assert.equal(r.status,201);users.push(r.data.user.id);return r.data;}
 const a=await patient('a'),b=await patient('b');
 const categories=['Pain Relief','Cold & Flu','Vitamins','First Aid','Diabetes Care','Skin Care','Digestive Health','Personal Care'];
 for(const [i,category]of categories.entries()){const [p]=await pool.query('INSERT INTO pharmacy_products(sku,name,category,description,manufacturer,pack_size,price_paise,stock,requires_prescription,active,is_demo) VALUES(?,?,?,?,?,?,?,3,?,TRUE,TRUE)',[tag+'-'+i,tag+' '+i,category,'Disposable demo test','Fixture','1 pack',1000+i*100,i===4]);products.push(p.insertId);}
 await pool.query('UPDATE pharmacy_products SET stock=0 WHERE id=?',[products[7]]);
 await patientDemoUI('http://127.0.0.1:'+port,a,tag);
 await productPageUI('http://127.0.0.1:'+port,a,products[0]);await api('/pharmacy/cart/'+products[0],a,'PUT',{quantity:0});
 const catalogue=(await api('/pharmacy/catalogue?search='+tag)).data;assert.equal(catalogue.products.length,8);assert.equal(catalogue.services.ordering,false);assert.equal(catalogue.services.demoCheckout,true);assert.ok(catalogue.products.every(p=>p.is_demo));
 for(const category of categories){const r=await api('/pharmacy/catalogue?search='+tag+'&category='+encodeURIComponent(category));assert.equal(r.data.products.length,1);assert.equal(r.data.products[0].category,category);}
 for(const sort of ['name','price_asc','price_desc','newest']){const rows=(await api('/pharmacy/catalogue?search='+tag+'&sort='+sort)).data.products;assert.equal(rows.length,8);if(sort==='price_asc')assert.ok(rows.every((p,i)=>!i||rows[i-1].price_paise<=p.price_paise));if(sort==='price_desc')assert.ok(rows.every((p,i)=>!i||rows[i-1].price_paise>=p.price_paise));}
 assert.equal((await api('/pharmacy/catalogue?sort=invalid')).status,400);
 assert.equal((await api('/pharmacy/orders')).status,401);
 async function cart(p,q){const r=await api('/pharmacy/cart/'+p,a,'PUT',{quantity:q});assert.equal(r.status,200,JSON.stringify(r.data));}
 assert.equal((await api('/pharmacy/cart/'+products[7],a,'PUT',{quantity:1})).status,409,'Out-of-stock product cannot enter cart');
 assert.equal((await api('/pharmacy/catalogue?search='+tag+'-not-found')).data.products.length,0);
 await cart(products[0],2);assert.equal((await api('/pharmacy/cart',b)).data.items.length,0);assert.equal((await api('/pharmacy/cart/'+products[0],a,'PUT',{quantity:4})).status,409);await cart(products[0],0);await cart(products[0],2);
 const key=randomUUID(),body={checkoutKey:key,address:'Disposable test address',phone:'0000000000',paymentMethod:'Test'};const order=await api('/pharmacy/orders',a,'POST',body);assert.equal(order.status,201,JSON.stringify(order.data));assert.equal(order.data.testCheckout,true);assert.equal((await api('/pharmacy/orders',a,'POST',body)).data.id,order.data.id);
 const saved=(await api('/pharmacy/orders',a)).data.orders.find(o=>o.id===order.data.id);assert.equal(saved.total_paise,2000);assert.equal(saved.status,'Test complete');assert.equal(saved.payment_mode,'Test');assert.equal(saved.payment_status,'Unpaid');assert.equal(saved.payment_method,'Test');assert.equal((await api('/pharmacy/orders',b)).data.orders.length,0);
 const [[stock]]=await pool.query('SELECT stock FROM pharmacy_products WHERE id=?',[products[0]]);assert.equal(stock.stock,3,'Test checkout never reserves real stock');
 assert.equal((await api('/pharmacy/orders/'+saved.id+'/status',admin,'POST',{status:'Packing',note:'Cannot ship tests'})).status,409);
 await cart(products[4],1);assert.equal((await api('/pharmacy/orders',a,'POST',{...body,checkoutKey:randomUUID()})).status,400);
 const bytes=Buffer.from('%PDF-1.4\nDisposable prescription fixture');const upload=await api('/health-dashboard/documents',a,'POST',{filename:'fixture.pdf',mimeType:'application/pdf',content:bytes.toString('base64')});assert.equal(upload.status,201);const docs=(await api('/health-dashboard',a)).data.documents;const docId=docs.find(d=>d.filename==='fixture.pdf').id;
 assert.equal((await api('/pharmacy/prescription-reviews',b,'POST',{documentId:docId})).status,400);
 const check=await api('/pharmacy/prescription-reviews',a,'POST',{documentId:docId});assert.equal(check.status,201);const review=check.data.id;
 assert.equal((await api('/pharmacy/prescription-reviews',b)).data.reviews.length,0);
 const hidden=await fetch('http://127.0.0.1:'+port+'/api/pharmacy/prescription-reviews/'+review+'/document',{headers:{Authorization:'Bearer '+b.token}});assert.equal(hidden.status,404);
 assert.equal((await api('/pharmacy/prescription-reviews/'+review+'/decision',a,'POST',{decision:'Approved',note:'Not authorized'})).status,403);
 assert.equal((await api('/pharmacy/orders',a,'POST',{...body,checkoutKey:randomUUID(),reviewId:review})).status,409,'Pending approval blocks checkout');
 await pharmacistReviewUI('http://127.0.0.1:'+port,admin,review);
 await cart(products[4],2);assert.equal((await api('/pharmacy/orders',a,'POST',{...body,checkoutKey:randomUUID(),reviewId:review})).status,409,'Changed cart invalidates approval');await cart(products[4],1);
 const rx=await api('/pharmacy/orders',a,'POST',{...body,checkoutKey:randomUUID(),reviewId:review});assert.equal(rx.status,201,JSON.stringify(rx.data));await cart(products[4],1);assert.equal((await api('/pharmacy/orders',a,'POST',{...body,checkoutKey:randomUUID(),reviewId:review})).status,409,'Approval cannot be reused');
 productionServer=spawn(process.execPath,['server.js'],{cwd:new URL('../',import.meta.url),windowsHide:true,stdio:'pipe',env:{...process.env,PORT:'5023',NODE_ENV:'production',PHARMACY_DEMO_ENABLED:'true',PHARMACY_ENABLED:'false',MEDICINE_WORKER_ENABLED:'false',CARE_MAINTENANCE_ENABLED:'false'}});productionServer.stdout.on('data',()=>{});productionServer.stderr.on('data',()=>{});
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:5023/api/health')).ok)break;}catch{}if(productionServer.exitCode!==null)throw new Error('Production-guard test API failed');await new Promise(r=>setTimeout(r,100));}
 const productionCatalogue=await (await fetch('http://127.0.0.1:5023/api/pharmacy/catalogue?search='+tag)).json();assert.equal(productionCatalogue.products.length,0);assert.equal(productionCatalogue.services.demoCheckout,false);
 const deniedTest=await fetch('http://127.0.0.1:5023/api/pharmacy/orders',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+a.token},body:JSON.stringify({...body,checkoutKey:randomUUID()})});assert.equal(deniedTest.status,503,'Production cannot enable development checkout');
 console.log('PASS: production hides demo inventory and rejects test checkout even with the demo environment flag set.');
 console.log('PASS: real database/API and DOM UI demo checkout, all eight categories, four sorting modes, search, private carts/orders, quantities/INR totals, stock guards, idempotency, no charge/reservation/dispatch, private prescription upload, pre-checkout pharmacist approval, changed-cart and reused-approval denial. Disposable test records only; no real medicine order, payment or delivery.');
}finally{if(productionServer){productionServer.kill();await new Promise(r=>{if(productionServer.exitCode!==null)return r();productionServer.once('exit',r);setTimeout(r,3000);});}if(server){server.kill();await new Promise(r=>{if(server.exitCode!==null)return r();server.once('exit',r);setTimeout(r,3000);});}if(users.length)await pool.query('DELETE FROM users WHERE id IN (?) AND email LIKE ?',[users,tag+'%']);if(products.length)await pool.query('DELETE FROM pharmacy_products WHERE id IN (?) AND sku LIKE ?',[products,tag+'%']);await pool.end();}
