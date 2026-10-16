import pool from '../config/db.js';
import {ensureCareSchema} from '../services/careSchema.js';
const entries=[
 ['SKIN-CLEANSER','Gentle Face Cleanser','Skin Care','A gentle daily facial cleansing product.','150 ml',19900],
 ['SKIN-SUNSCREEN','Sunscreen Lotion','Skin Care','An illustrative everyday sun-care lotion listing. Follow the actual product label.','50 ml',29900],
 ['SKIN-LIP-BALM','Moisturizing Lip Balm','Skin Care','An everyday lip-care product.','4 g',9900],
 ['SKIN-BODY-LOTION','Daily Body Lotion','Skin Care','An everyday body moisturizer.','200 ml',24900],
 ['HEALTH-THERMOMETER','Digital Thermometer','General Health Care','A digital thermometer for home temperature measurement. Follow device instructions.','1 device',17900],
 ['HEALTH-FIRST-AID','Home First Aid Kit','First Aid','An illustrative basic kit containing dressings and first-aid supplies.','1 kit',34900],
 ['HYGIENE-ANTISEPTIC','Antiseptic Liquid','Personal Care','Generic antiseptic hygiene product. Illustrative listing only, not an official Dettol product. Follow the actual product label.','250 ml',14900],
 ['HYGIENE-HAND-WASH','Liquid Hand Wash','Personal Care','An everyday hand-cleansing product.','250 ml',9900],
 ['FIRST-AID-COTTON','Cotton Roll','First Aid','A sealed cotton roll for everyday first-aid supplies.','100 g',6500],
 ['FIRST-AID-BANDAGES','Adhesive Bandages','First Aid','Individually wrapped adhesive bandages for a home first-aid kit.','20 strips',8900],
 ['FIRST-AID-STRIPS','Handyplast-style Adhesive Strips','First Aid','Generic adhesive plaster strips of the type sometimes called Handiplus or Handyplast. Demo listing only, not an official branded product.','10 strips',4500],
 ['FIRST-AID-CREPE','Crepe Bandage','First Aid','An illustrative elastic crepe bandage listing. Follow the actual product instructions.','1 roll - 8 cm',9500],
 ['FIRST-AID-TAPE','Medical Paper Tape','First Aid','A roll of first-aid paper tape for securing dressings.','1 roll - 2.5 cm',5500]
];
try{if(process.env.NODE_ENV==='production')throw new Error('Demo additions are prohibited in production.');await ensureCareSchema();const c=await pool.getConnection();try{await c.beginTransaction();let added=0;for(const [key,name,category,description,pack,price]of entries){const sku='MEDICARE-DEMO-'+key;const [[prior]]=await c.query('SELECT id FROM pharmacy_products WHERE sku=?',[sku]);if(prior)continue;await c.query('INSERT INTO pharmacy_products(sku,name,category,description,manufacturer,pack_size,price_paise,stock,requires_prescription,active,is_demo) VALUES(?,?,?,?,?,?,?,20,FALSE,TRUE,TRUE)',[sku,name,category,'DEMO DATA: illustrative product, sample price and stock only. Not a medical recommendation. '+description,'Demo catalogue - illustrative only',pack,price]);added++;}await c.commit();console.log('Added '+added+' demo skincare/everyday healthcare products; existing records preserved.');}catch(e){await c.rollback();throw e;}finally{c.release();}}finally{await pool.end();}
