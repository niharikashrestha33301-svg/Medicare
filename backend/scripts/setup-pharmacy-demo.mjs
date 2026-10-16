import pool from '../config/db.js';
import {ensureCareSchema} from '../services/careSchema.js';
const entries=[
 ['Paracetamol 500 mg','Pain Relief','Illustrative pain relief medicine listing. Follow clinician and label instructions.','10 tablets',2500,false],
 ['Saline Nasal Spray','Cold & Flu','Illustrative saline nasal spray listing.','20 ml',6500,false],
 ['Vitamin C Tablets','Vitamins','Illustrative vitamin supplement listing.','15 tablets',9500,false],
 ['Sterile Gauze Pads','First Aid','Illustrative sterile dressing listing.','10 pads',4500,false],
 ['Metformin 500 mg','Diabetes Care','Prescription-only illustrative listing. Pharmacist verification required.','10 tablets',4200,true],
 ['Moisturizing Cream','Skin Care','Illustrative skin moisturizer listing.','50 g',12500,false],
 ['Oral Rehydration Salts','Digestive Health','Illustrative oral rehydration product listing. Follow packet instructions.','1 sachet',2200,false],
 ['Hand Sanitizer','Personal Care','Illustrative personal hygiene listing.','100 ml',6000,false]
];
try{
 if(process.env.NODE_ENV==='production')throw new Error('Demo inventory is prohibited in production.');await ensureCareSchema();const c=await pool.getConnection();try{await c.beginTransaction();const [[lock]]=await c.query("SELECT GET_LOCK('medicare_pharmacy_demo_seed',10) AS acquired");if(!lock.acquired)throw new Error('Could not lock demo setup.');try{const [[count]]=await c.query('SELECT COUNT(*) AS n FROM pharmacy_products');if(count.n){console.log('Inventory is not empty; no records changed.');}else{for(const [i,e]of entries.entries()){const [name,category,description,pack,price,rx]=e;await c.query('INSERT INTO pharmacy_products(sku,name,category,description,manufacturer,pack_size,price_paise,stock,requires_prescription,active,is_demo) VALUES(?,?,?,?,?,?,?,?,?,TRUE,TRUE)',['MEDICARE-DEMO-'+(i+1),name,category,'DEMO DATA — not real availability or a medical recommendation. '+description,'Demo catalogue — illustrative only',pack,price,i===7?0:20,rx]);}console.log('Added 8 clearly labelled development-only demo products. No real inventory or availability is represented.');}await c.commit();}finally{await c.query("SELECT RELEASE_LOCK('medicare_pharmacy_demo_seed')");}}catch(e){await c.rollback();throw e;}finally{c.release();}
}finally{await pool.end();}
