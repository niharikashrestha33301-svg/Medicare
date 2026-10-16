import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from '../../frontend/node_modules/jsdom/lib/api.js';
const root=new URL('../../frontend/public/',import.meta.url),w=new JSDOM(fs.readFileSync(new URL('pharmacy.html',root),'utf8'),{url:'http://localhost:5000/pharmacy.html',runScripts:'outside-only'}).window;
w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
const calls=[];let inventory=[];const settle=async()=>{for(let i=0;i<15;i++)await new Promise(r=>setTimeout(r,0));};
w.MedicareAPI={base:'/api',session:()=>({token:'fixture',user:{role:'admin',name:'Fixture'}}),request:async(path,options={})=>{calls.push({path,options});const b=JSON.parse(options.body||'{}');
 if(path.startsWith('/pharmacy/catalogue'))return{products:inventory.filter(p=>p.active),categories:['Fixture category'],services:{ordering:false,cod:false,message:'Ordering unavailable'}};
 if(path==='/pharmacy/account')return{role:'admin',canReview:false,userId:1,readiness:{message:'Ordering unavailable',requirements:['Authorization required']}};
 if(path==='/pharmacy/prescription-reviews')return{reviews:[]};
 if(path==='/pharmacy/orders')return{orders:[]};
 if(path==='/pharmacy/inventory'&&options.method==='POST'){inventory=[{...b,id:1,pack_size:b.packSize,price_paise:b.pricePaise,requires_prescription:b.requiresPrescription,version:0}];return{id:1};}
 if(path==='/pharmacy/inventory')return{products:inventory};
 if(path.endsWith('/information'))return{};
 if(path.endsWith('/image')){inventory[0].hasImage=true;inventory[0].version++;return{};}
 if(options.method==='DELETE'){inventory[0].active=false;return{};}throw new Error('Unexpected request '+path);
}};
try{
 for(const name of ['care-page','pharmacy-catalogue','pharmacy'])w.eval(fs.readFileSync(new URL(name+'.js',root),'utf8'));await settle();const $=id=>w.document.getElementById(id),form=$('inventory-form');assert.equal($('operator').hidden,false);assert.ok($('pharmacy-readiness').textContent.includes('Authorization required'));
 for(const [key,value]of Object.entries({sku:'FIXTURE',name:'Fixture medicine',category:'Fixture category',manufacturer:'Fixture',packSize:'1 pack',description:'Fixture only',price:'123.45',stock:'3'}))form.elements.namedItem(key).value=value;
 form.elements.namedItem('active').checked=true;
 const file=new w.File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])],'fixture.png',{type:'image/png'});Object.defineProperty(form.elements.namedItem('image'),'files',{value:[file],configurable:true});
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();assert.equal(inventory[0].price_paise,12345);assert.ok(calls.some(c=>c.path.endsWith('/image')&&c.options.method==='PUT'));assert.ok(w.document.querySelector('.pharmacy-image'));assert.equal($('place-order').type,'button');
 w.document.querySelector('[data-edit-product]').click();assert.equal(form.elements.namedItem('name').value,'Fixture medicine');assert.equal(form.elements.namedItem('version').value,'1');
 $('new-product').click();assert.equal(form.elements.namedItem('id').value,'');
 $('categories').value='Fixture category';$('categories').dispatchEvent(new w.Event('change'));await settle();assert.ok(calls.some(c=>c.path.includes('category=Fixture+category')));
 w.document.querySelector('[data-archive-product]').click();await settle();assert.equal(inventory[0].active,false);assert.equal(w.document.querySelectorAll('#catalogue .product').length,0);
 console.log('PASS: simulated admin inventory add/edit, INR calculations, image upload, archive, immediate category filters and setup-only checkout state. Real database workflows are covered separately.');
}finally{w.close();}
