import express from 'express';
import {randomUUID} from 'node:crypto';
import pool from '../config/db.js';
import {protect,authorizeRoles} from '../middleware/authMiddleware.js';
import {ensureCareSchema} from '../services/careSchema.js';
import {limiter,problem,uuid,validSignature} from '../services/careSecurity.js';
import {paymentsConfigured,gateway,recordCaptured} from '../services/pharmacyPayments.js';
import {submitPrescriptionCheck,approvedPrescription} from '../services/pharmacyPrescriptions.js';
import {pharmacyReadiness,demoCheckoutEnabled} from '../services/pharmacyReadiness.js';
import {id,string,badRequest,fail} from '../utils/validation.js';
const router=express.Router(),wrap=fn=>(req,res)=>Promise.resolve(fn(req,res)).catch(error=>fail(res,error));
export const reviewer=user=>user.role==='admin'&&(process.env.PHARMACY_REVIEWER_IDS||'').split(',').map(v=>v.trim()).includes(String(user.id));
const cod=()=>process.env.PHARMACY_COD_ENABLED==='true';
const int=(value,min,max)=>{if(!['number','string'].includes(typeof value)||typeof value==='string'&&!/^(0|[1-9]\d*)$/.test(value))throw badRequest('Enter a valid whole number.');const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)throw badRequest('Enter a valid whole number.');return n;};
router.use((req,res,next)=>ensureCareSchema().then(()=>next()).catch(next));
const informationColumns=`p.id,p.sku,p.name,p.category,p.description,p.manufacturer,p.pack_size,p.price_paise,p.stock,p.requires_prescription,p.version,p.is_demo,
 COALESCE(i.reference_only,FALSE) AS reference_only,COALESCE(i.brand,'') AS brand,COALESCE(i.strength,'') AS strength,
 COALESCE(i.source_url,'') AS source_url,COALESCE(i.source_name,'') AS source_name,i.source_checked_at,
 COALESCE(i.clinical_verified,FALSE) AS clinical_verified,COALESCE(i.usage_text,'') AS usage_text,COALESCE(i.precautions_text,'') AS precautions_text,
 (p.image_content IS NOT NULL AND i.image_verified=TRUE AND i.image_rights_confirmed=TRUE) AS hasImage`;
router.get('/catalogue',limiter(180),wrap(async(req,res)=>{
 const search=string(req.query.search||'','search',120,false),category=string(req.query.category||'','category',80,false),sort=string(req.query.sort||'name','sort order',30);
 const sorts={name:'p.name,p.id',price_asc:'p.price_paise,p.id',price_desc:'p.price_paise DESC,p.id',newest:'p.id DESC'};if(!sorts[sort])throw badRequest('Choose a valid sort order.');
 const availability=req.query.availability||'all',prescription=req.query.prescription||'all',kind=req.query.kind||'all';
 if(!['all','in_stock'].includes(availability)||!['all','required','non_prescription'].includes(prescription)||!['all','reference','sample','inventory'].includes(kind))throw badRequest('Choose valid catalogue filters.');
 const page=int(req.query.page||1,1,10000),limit=int(req.query.limit||24,1,200);
 const conditions=['p.active=TRUE','(p.is_demo=FALSE OR ?=TRUE)','(p.name LIKE ? OR p.description LIKE ? OR p.sku LIKE ? OR i.brand LIKE ?)'],params=[demoCheckoutEnabled(),...Array(4).fill('%'+search+'%')];
 if(category){conditions.push('p.category=?');params.push(category);}if(availability==='in_stock')conditions.push('p.stock>0 AND COALESCE(i.reference_only,FALSE)=FALSE');
 if(prescription==='required')conditions.push('p.requires_prescription=TRUE AND COALESCE(i.reference_only,FALSE)=FALSE');if(prescription==='non_prescription')conditions.push('p.requires_prescription=FALSE AND COALESCE(i.reference_only,FALSE)=FALSE');
 if(kind==='reference')conditions.push('i.reference_only=TRUE');if(kind==='sample')conditions.push('p.is_demo=TRUE');if(kind==='inventory')conditions.push('p.is_demo=FALSE AND COALESCE(i.reference_only,FALSE)=FALSE');
 const from=' FROM pharmacy_products p LEFT JOIN pharmacy_product_information i ON i.product_id=p.id WHERE '+conditions.join(' AND ');
 const [products]=await pool.query('SELECT '+informationColumns+from+' ORDER BY '+sorts[sort]+' LIMIT ? OFFSET ?',[...params,limit,(page-1)*limit]);
 const [[count]]=await pool.query('SELECT COUNT(*) AS total'+from,params);
 const [categories]=await pool.query('SELECT DISTINCT category FROM pharmacy_products WHERE active=TRUE AND (is_demo=FALSE OR ?=TRUE) ORDER BY category',[demoCheckoutEnabled()]);
 res.json({success:true,products,total:count.total,page,hasMore:page*limit<count.total,categories:[...new Set(['Tablets','Capsules','Syrups','First Aid','Vitamins','Skin Care','Personal Care','Diabetes Care','Pain Relief','Medical Devices',...categories.map(c=>c.category)])],services:await pharmacyReadiness()});
}));
router.get('/products/:product',wrap(async(req,res)=>{
 const [[product]]=await pool.query('SELECT '+informationColumns+' FROM pharmacy_products p LEFT JOIN pharmacy_product_information i ON i.product_id=p.id WHERE p.id=? AND p.active=TRUE AND (p.is_demo=FALSE OR ?=TRUE)',[id(req.params.product),demoCheckoutEnabled()]);if(!product)throw problem('Product unavailable.',404);res.json({success:true,product});
}));
router.get('/products/:product/image',limiter(180),wrap(async(req,res)=>{
 const [[p]]=await pool.query('SELECT image_content,image_mime FROM pharmacy_products p JOIN pharmacy_product_information i ON i.product_id=p.id WHERE p.id=? AND p.active=TRUE AND i.image_verified=TRUE AND i.image_rights_confirmed=TRUE AND (p.is_demo=FALSE OR ?=TRUE)',[id(req.params.product),demoCheckoutEnabled()]);if(!p?.image_content)throw problem('Medicine image unavailable.',404);
 res.set({'Content-Type':p.image_mime,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; sandbox"});res.send(p.image_content);
}));
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.use(protect,authorizeRoles('patient','admin'),limiter(120));
const patient=authorizeRoles('patient'),admin=authorizeRoles('admin');
const requireReviewer=(req,res,next)=>reviewer(req.user)?next():res.status(403).json({success:false,message:'Only an explicitly authorized pharmacy reviewer can verify prescriptions or access their documents.'});
router.get('/account',wrap(async(req,res)=>{
  res.json({success:true,role:req.user.role,canReview:reviewer(req.user),userId:req.user.id,...(req.user.role==='admin'?{readiness:await pharmacyReadiness()}: {})});
}));
router.get('/cart',patient,wrap(async(req,res)=>{
  const [items]=await pool.query('SELECT p.id,p.name,p.stock,p.active,p.price_paise,p.requires_prescription,p.is_demo,c.quantity FROM pharmacy_cart c JOIN pharmacy_products p ON p.id=c.product_id WHERE c.patient_id=? AND (p.is_demo=FALSE OR ?=TRUE) ORDER BY p.id',[req.user.id,demoCheckoutEnabled()]);
  res.json({success:true,items});
}));
router.put('/cart/:product',patient,wrap(async(req,res)=>{
  const product=id(req.params.product),quantity=int(req.body.quantity,0,99);
  const c=await pool.getConnection();try{await c.beginTransaction();await c.query('SELECT id FROM users WHERE id=? FOR UPDATE',[req.user.id]);
  if(!quantity)await c.query('DELETE FROM pharmacy_cart WHERE patient_id=? AND product_id=?',[req.user.id,product]);
  else{const [[p]]=await c.query('SELECT p.stock,p.active,p.is_demo,COALESCE(i.reference_only,FALSE) AS reference_only FROM pharmacy_products p LEFT JOIN pharmacy_product_information i ON i.product_id=p.id WHERE p.id=? FOR UPDATE',[product]);if(!p?.active||p.reference_only||p.is_demo&&!demoCheckoutEnabled())throw problem('This medicine is unavailable.',404);if(quantity>p.stock)throw problem('The requested quantity exceeds current stock.');await c.query('INSERT INTO pharmacy_cart (patient_id,product_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=VALUES(quantity)',[req.user.id,product,quantity]);}
  await c.commit();res.json({success:true});}catch(e){await c.rollback();throw e;}finally{c.release();}
}));
router.post('/prescription-reviews',patient,limiter(10),wrap(async(req,res)=>res.status(201).json({success:true,id:await submitPrescriptionCheck(req.user.id,req.body.documentId)})));
router.get('/prescription-reviews',wrap(async(req,res)=>{
 if(req.user.role==='admin'&&!reviewer(req.user))return res.json({success:true,reviews:[]});
 const [reviews]=await pool.query(`SELECT id,patient_id,items_json,filename,status,note,used_order,created_at,reviewed_at FROM pharmacy_prescription_checks ${req.user.role==='admin'?'':'WHERE patient_id=?'} ORDER BY created_at DESC LIMIT 100`,req.user.role==='admin'?[]:[req.user.id]);
 res.json({success:true,reviews:reviews.map(r=>({...r,items:JSON.parse(r.items_json),items_json:undefined}))});
}));
router.get('/prescription-reviews/:review/document',wrap(async(req,res)=>{
 const [[r]]=await pool.query('SELECT * FROM pharmacy_prescription_checks WHERE id=?',[uuid(req.params.review)]);if(!r||(req.user.role==='admin'?!reviewer(req.user):r.patient_id!==req.user.id))throw problem('Prescription review unavailable.',404);
 res.set({'Content-Type':r.mime_type,'X-Content-Type-Options':'nosniff','Content-Disposition':'attachment; filename="prescription"'});res.send(r.content);
}));
router.post('/prescription-reviews/:review/decision',admin,requireReviewer,wrap(async(req,res)=>{
 if(!['Approved','Rejected'].includes(req.body.decision))throw badRequest('Choose an approval decision.');const note=string(req.body.note,'pharmacist review note',1000);
 const [r]=await pool.query("UPDATE pharmacy_prescription_checks SET status=?,note=?,reviewed_by=?,reviewed_at=UTC_TIMESTAMP() WHERE id=? AND status='Pending' AND used_order IS NULL",[req.body.decision,note,req.user.id,uuid(req.params.review)]);if(!r.affectedRows)throw problem('This prescription is no longer pending.');res.json({success:true});
}));
router.post('/orders',patient,wrap(async(req,res)=>{
  const test=req.body.paymentMethod==='Test';const readiness=await pharmacyReadiness();if(test?!readiness.demoCheckout:!readiness.ordering)throw problem(readiness.message+' '+readiness.requirements.join(' '),503);
  if(typeof req.body.phone!=='string'||!/^\+?[\d ()-]+$/.test(req.body.phone)||req.body.phone.replace(/\D/g,'').length<7||req.body.phone.replace(/\D/g,'').length>15)throw badRequest('Enter a valid contact phone.');
  const checkoutKey=uuid(req.body.checkoutKey),address=string(req.body.address,'delivery address',1000),phone=string(req.body.phone,'contact phone',30),method=req.body.paymentMethod;
  if(!['COD','Online','Test'].includes(method)||method==='COD'&&!cod()||method==='Online'&&!paymentsConfigured())throw problem('This payment method is unavailable.',503);
  const connection=await pool.getConnection();try{await connection.beginTransaction();
    // Serialize checkouts and cart edits against this patient; inventory locks use product ID order.
    await connection.query('SELECT id FROM users WHERE id=? FOR UPDATE',[req.user.id]);
    const [[prior]]=await connection.query('SELECT id FROM pharmacy_orders WHERE patient_id=? AND checkout_key=?',[req.user.id,checkoutKey]);
    if(prior){await connection.commit();return res.json({success:true,id:prior.id});}
    const [cart]=await connection.query('SELECT product_id,quantity FROM pharmacy_cart WHERE patient_id=? ORDER BY product_id FOR UPDATE',[req.user.id]);
    if(!cart.length||cart.length>50)throw badRequest('Your cart must contain between 1 and 50 medicines.');
    const items=[];let total=0,needsRx=false;
    for(const item of cart){const [[p]]=await connection.query('SELECT p.*,COALESCE(i.reference_only,FALSE) AS reference_only FROM pharmacy_products p LEFT JOIN pharmacy_product_information i ON i.product_id=p.id WHERE p.id=? FOR UPDATE',[item.product_id]);
      if(!p?.active||p.reference_only||p.stock<item.quantity||p.is_demo&&!test)throw problem('Stock has changed. Review your cart.');
      items.push({...p,quantity:item.quantity});total+=p.price_paise*item.quantity;needsRx=needsRx||!!p.requires_prescription;
    }
    if(!Number.isSafeInteger(total)||total<=0||total>100000000)throw badRequest('Order total is outside the supported range.');
    let document=null;if(needsRx)document=await approvedPrescription(connection,req.user.id,items,req.body.reviewId);
    const orderId=randomUUID(),status=test?'Test complete':method==='Online'?'Awaiting payment':'Confirmed';
    await connection.query('INSERT INTO pharmacy_orders (id,patient_id,checkout_key,status,total_paise,address,phone,prescription_required,review_status,reviewed_by,review_note,payment_method,payment_mode) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[orderId,req.user.id,checkoutKey,status,total,address,phone,needsRx,needsRx?'Approved':'Not required',document?.reviewed_by||null,document?.note||'',method,test||method==='Online'&&process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test_')?'Test':'Live']);
    for(const item of items){await connection.query('INSERT INTO pharmacy_order_items (order_id,product_id,name,price_paise,quantity) VALUES (?,?,?,?,?)',[orderId,item.id,item.name,item.price_paise,item.quantity]);if(!test)await connection.query('UPDATE pharmacy_products SET stock=stock-?,version=version+1 WHERE id=?',[item.quantity,item.id]);}
    if(document)await connection.query('UPDATE pharmacy_prescription_checks SET used_order=? WHERE id=?',[orderId,document.id]);
    if(document)await connection.query('INSERT INTO pharmacy_order_documents (order_id,filename,mime_type,content) VALUES (?,?,?,?)',[orderId,document.filename,document.mime_type,document.content]);
    await connection.query('INSERT INTO pharmacy_order_events (order_id,status,note,actor_id) VALUES (?,?,?,?)',[orderId,status,test?'TEST CHECKOUT ONLY: no payment, stock reservation, dispensing or delivery.':'Order placed; stock reserved. Prescription approval validated when required.',req.user.id]);
    await connection.query('DELETE FROM pharmacy_cart WHERE patient_id=?',[req.user.id]);await connection.commit();res.status(201).json({success:true,id:orderId,testCheckout:test});
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}));
async function owned(connection,req,lock=false){
  const [[o]]=await connection.query('SELECT * FROM pharmacy_orders WHERE id=?'+(lock?' FOR UPDATE':''),[uuid(req.params.order)]);
  if(!o||req.user.role!=='admin'&&o.patient_id!==req.user.id)throw problem('Order not found.',404);return o;
}
router.get('/orders',wrap(async(req,res)=>{
  const [orders]=await pool.query(`SELECT id,patient_id,status,total_paise,address,phone,review_status,review_note,payment_status,payment_method,payment_mode,carrier,tracking_number,created_at,updated_at FROM pharmacy_orders ${req.user.role==='admin'?'':'WHERE patient_id=?'} ORDER BY created_at DESC LIMIT 100`,req.user.role==='admin'?[]:[req.user.id]);
  for(const order of orders){const [items]=await pool.query('SELECT product_id,name,price_paise,quantity FROM pharmacy_order_items WHERE order_id=?',[order.id]);const [events]=await pool.query('SELECT status,note,created_at FROM pharmacy_order_events WHERE order_id=? ORDER BY id',[order.id]);order.items=items;order.events=events;}
  res.json({success:true,orders});
}));
async function releaseStock(connection,order){
  const [items]=await connection.query('SELECT product_id,quantity FROM pharmacy_order_items WHERE order_id=? ORDER BY product_id',[order.id]);
  for(const item of items)await connection.query('UPDATE pharmacy_products SET stock=stock+?,version=version+1 WHERE id=?',[item.quantity,item.product_id]);
}
router.post('/orders/:order/cancel',wrap(async(req,res)=>{
  const connection=await pool.getConnection();try{await connection.beginTransaction();const order=await owned(connection,req,true);
    if(order.status==='Cancelled'){await connection.commit();return res.json({success:true});}
    if(!['Awaiting review','Awaiting payment','Confirmed'].includes(order.status)||order.payment_status==='Paid'||order.gateway_order_id||order.payment_lease)throw problem('This order cannot be cancelled automatically. Contact the pharmacy for payment reconciliation or a refund.');
    await releaseStock(connection,order);await connection.query("UPDATE pharmacy_orders SET status='Cancelled' WHERE id=?",[order.id]);
    await connection.query("INSERT INTO pharmacy_order_events (order_id,status,note,actor_id) VALUES (?,'Cancelled','Order cancelled; reserved stock released.',?)",[order.id,req.user.id]);await connection.commit();res.json({success:true});
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}));
router.get('/orders/:order/prescription',wrap(async(req,res)=>{
  const order=await owned(pool,req);if(req.user.role==='admin'&&!reviewer(req.user))throw problem('Pharmacy reviewer authorization required.',403);
  const [[doc]]=await pool.query('SELECT * FROM pharmacy_order_documents WHERE order_id=?',[order.id]);if(!doc)throw problem('No prescription document.',404);
  res.set({'Content-Type':doc.mime_type,'X-Content-Type-Options':'nosniff','Content-Disposition':`attachment; filename="prescription"; filename*=UTF-8''${encodeURIComponent(doc.filename)}`});res.send(doc.content);
}));
router.post('/orders/:order/review',admin,requireReviewer,wrap(async(req,res)=>{
  const decision=req.body.decision;if(!['Approved','Rejected'].includes(decision))throw badRequest('Choose a prescription decision.');
  const note=string(req.body.note,'review note',1000),connection=await pool.getConnection();
  try{await connection.beginTransaction();const order=await owned(connection,req,true);if(order.status!=='Awaiting review'||order.review_status!=='Pending')throw problem('This order is not awaiting review.');
    const status=decision==='Rejected'?'Rejected':order.payment_method==='Online'?'Awaiting payment':'Confirmed';
    if(decision==='Rejected')await releaseStock(connection,order);
    await connection.query('UPDATE pharmacy_orders SET status=?,review_status=?,reviewed_by=?,review_note=? WHERE id=?',[status,decision,req.user.id,note,order.id]);
    await connection.query('INSERT INTO pharmacy_order_events (order_id,status,note,actor_id) VALUES (?,?,?,?)',[order.id,status,'Pharmacist review: '+decision+'. '+note,req.user.id]);await connection.commit();res.json({success:true});
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}));
router.post('/orders/:order/status',admin,wrap(async(req,res)=>{
  const next=req.body.status,note=string(req.body.note,'delivery update',1000),carrier=string(req.body.carrier||'','carrier',120,false),tracking=string(req.body.trackingNumber||'','tracking number',160,false);
  const connection=await pool.getConnection();try{await connection.beginTransaction();const order=await owned(connection,req,true);
    const allowed={Confirmed:'Packing',Packing:'Dispatched',Dispatched:'Delivered'};
    if(order.prescription_required&&order.review_status!=='Approved')throw problem('Authorized pharmacist approval is required before dispensing.');
    if(order.payment_mode==='Test')throw problem('Sandbox orders cannot be fulfilled.');
    if(allowed[order.status]!==next)throw problem('Invalid order status transition.');
    if(next==='Dispatched'&&(!carrier||!tracking))throw badRequest('Enter the real carrier and tracking number before dispatch.');
    if(order.payment_method==='Online'&&order.payment_status!=='Paid')throw problem('Captured payment is required before fulfillment.');
    if(next==='Delivered'&&order.payment_method==='COD'&&req.body.codCollected!==true)throw badRequest('Confirm actual cash collection before marking a cash-on-delivery order delivered.');
    await connection.query('UPDATE pharmacy_orders SET status=?,carrier=?,tracking_number=?,payment_status=? WHERE id=?',[next,carrier||order.carrier,tracking||order.tracking_number,next==='Delivered'&&order.payment_method==='COD'?'Collected':order.payment_status,order.id]);
    await connection.query('INSERT INTO pharmacy_order_events (order_id,status,note,actor_id) VALUES (?,?,?,?)',[order.id,next,note,req.user.id]);await connection.commit();res.json({success:true});
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}));
router.get('/inventory',admin,wrap(async(req,res)=>{const [products]=await pool.query('SELECT '+informationColumns+',p.active,COALESCE(i.image_verified,FALSE) AS image_verified,COALESCE(i.image_rights_confirmed,FALSE) AS image_rights_confirmed FROM pharmacy_products p LEFT JOIN pharmacy_product_information i ON i.product_id=p.id ORDER BY p.id DESC');res.json({success:true,products});}));
router.put('/inventory/:product/information',admin,wrap(async(req,res)=>{
 const b=req.body,product=id(req.params.product);for(const key of ['imageVerified','imageRightsConfirmed','clinicalVerified','inventoryVerified'])if(typeof b[key]!=='boolean')throw badRequest('Confirm product verification selections.');
 if(b.clinicalVerified&&!reviewer(req.user))throw problem('Clinical information requires an authorized pharmacist reviewer.',403);
 const source=string(b.sourceUrl||'','source URL',1000,false);if(source){let url;try{url=new URL(source);}catch{throw badRequest('Enter an HTTPS source URL.');}if(url.protocol!=='https:'||url.username||url.password)throw badRequest('Enter a public HTTPS source URL.');}
 if((b.inventoryVerified||b.clinicalVerified||b.imageVerified)&&!source)throw badRequest('Provide the product-specific source before verification.');
 const brand=string(b.brand||'','brand',160,false);if(b.inventoryVerified&&!brand)throw badRequest('Provide the actual brand or verified generic manufacturer identity.');
 const c=await pool.getConnection();try{await c.beginTransaction();const [[p]]=await c.query('SELECT id,is_demo FROM pharmacy_products WHERE id=? AND version=? FOR UPDATE',[product,int(b.version,0,2147483647)]);if(!p)throw problem('Inventory changed. Refresh before verifying.');
 const [[prior]]=await c.query('SELECT reference_only FROM pharmacy_product_information WHERE product_id=?',[product]);const reference=prior?.reference_only&&!b.inventoryVerified;
 await c.query(`INSERT INTO pharmacy_product_information(product_id,brand,strength,source_url,source_name,source_checked_at,reference_only,image_verified,image_rights_confirmed,clinical_verified,usage_text,precautions_text,verified_by) VALUES(?,?,?,?,?,UTC_TIMESTAMP(),?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE brand=VALUES(brand),strength=VALUES(strength),source_url=VALUES(source_url),source_name=VALUES(source_name),source_checked_at=VALUES(source_checked_at),reference_only=VALUES(reference_only),image_verified=VALUES(image_verified),image_rights_confirmed=VALUES(image_rights_confirmed),clinical_verified=VALUES(clinical_verified),usage_text=VALUES(usage_text),precautions_text=VALUES(precautions_text),verified_by=VALUES(verified_by)`,[product,brand,string(b.strength||'','strength',200,false),source,string(b.sourceName||'','source name',180,false),!!reference,b.imageVerified,b.imageRightsConfirmed,b.clinicalVerified,string(b.usage||'','usage information',4000,false),string(b.precautions||'','precautions',4000,false),req.user.id]);await c.query('UPDATE pharmacy_products SET version=version+1 WHERE id=?',[product]);await c.commit();res.json({success:true});
 }catch(e){await c.rollback();throw e;}finally{c.release();}
}));
router.post('/inventory',admin,wrap(async(req,res)=>{
  const b=req.body,values=[string(b.sku,'SKU',80),string(b.name,'medicine name',180),string(b.category,'category',80),string(b.description,'description',4000),string(b.manufacturer,'manufacturer',160),string(b.packSize,'pack size',100),int(b.pricePaise,1,10000000),int(b.stock,0,1000000)];
  if(typeof b.requiresPrescription!=='boolean'||typeof b.active!=='boolean')throw badRequest('Choose prescription and catalogue status.');values.push(b.requiresPrescription,b.active);
  if(b.id){const [updated]=await pool.query('UPDATE pharmacy_products SET sku=?,name=?,category=?,description=?,manufacturer=?,pack_size=?,price_paise=?,stock=?,requires_prescription=?,active=?,version=version+1 WHERE id=? AND version=?',[...values,id(b.id),int(b.version,0,2147483647)]);if(!updated.affectedRows)throw problem('Inventory changed while you were editing. Refresh and review the current available stock.');}
  else{await pool.query('INSERT INTO pharmacy_products (sku,name,category,description,manufacturer,pack_size,price_paise,stock,requires_prescription,active) VALUES (?,?,?,?,?,?,?,?,?,?)',values);}
  const [[saved]]=await pool.query('SELECT id FROM pharmacy_products WHERE sku=?',[values[0]]);res.json({success:true,id:saved.id});
}));
router.put('/inventory/:product/image',admin,wrap(async(req,res)=>{
 const product=id(req.params.product),mime=req.body.mimeType,content=req.body.content;
 if(!['image/png','image/jpeg'].includes(mime)||typeof content!=='string'||content.length>1400000||!/^[A-Za-z0-9+/]+={0,2}$/.test(content))throw badRequest('Choose a PNG or JPEG image up to 1 MB.');
 const bytes=Buffer.from(content,'base64');if(bytes.length<12||bytes.length>1024*1024||bytes.toString('base64')!==content||(mime==='image/png'?!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):!bytes.subarray(0,3).equals(Buffer.from([255,216,255]))))throw badRequest('Image file type or content is invalid.');
 const c=await pool.getConnection();try{await c.beginTransaction();const [r]=await c.query('UPDATE pharmacy_products SET image_content=?,image_mime=?,version=version+1 WHERE id=? AND version=?',[bytes,mime,product,int(req.body.version,0,2147483647)]);if(!r.affectedRows)throw problem('Inventory changed. Refresh before uploading.');await c.query('UPDATE pharmacy_product_information SET image_verified=FALSE,image_rights_confirmed=FALSE WHERE product_id=?',[product]);await c.commit();res.json({success:true});}catch(e){await c.rollback();throw e;}finally{c.release();}
}));
router.delete('/inventory/:product',admin,wrap(async(req,res)=>{
 const [r]=await pool.query('UPDATE pharmacy_products SET active=FALSE,version=version+1 WHERE id=? AND version=?',[id(req.params.product),int(req.body.version,0,2147483647)]);if(!r.affectedRows)throw problem('Inventory changed. Refresh before archiving.');res.json({success:true,message:'Medicine archived. Order history and stock records are preserved.'});
}));
router.post('/orders/:order/payment',patient,wrap(async(req,res)=>{
  if(!paymentsConfigured())throw problem('Online payment is not configured.',503);
  const connection=await pool.getConnection();let order;
  try{await connection.beginTransaction();order=await owned(connection,req,true);
    if(order.status!=='Awaiting payment'||order.payment_method!=='Online')throw problem('Order is not ready for payment.');
    if(order.gateway_order_id){await connection.commit();return res.json({success:true,key:process.env.RAZORPAY_KEY_ID,orderId:order.gateway_order_id,amount:order.total_paise,currency:'INR'});}
    // Persist an in-flight guard. A timeout cannot create a second, ambiguous gateway order.
    if(order.payment_lease)throw problem('Payment creation is being reconciled. Contact the pharmacy before retrying.');
    await connection.query('UPDATE pharmacy_orders SET payment_lease=UTC_TIMESTAMP() WHERE id=?',[order.id]);await connection.commit();
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
  const created=await gateway('orders','POST',{amount:order.total_paise,currency:'INR',receipt:order.id});
  await pool.query('UPDATE pharmacy_orders SET gateway_order_id=?,payment_lease=NULL WHERE id=?',[created.id,order.id]);
  res.json({success:true,key:process.env.RAZORPAY_KEY_ID,orderId:created.id,amount:order.total_paise,currency:'INR'});
}));
router.post('/orders/:order/payment/verify',patient,wrap(async(req,res)=>{
  const order=await owned(pool,req),paymentId=string(req.body.paymentId,'payment identifier',100);
  if(!order.gateway_order_id||!validSignature(order.gateway_order_id+'|'+paymentId,req.body.signature,process.env.RAZORPAY_KEY_SECRET))throw problem('Invalid payment signature.',400);
  const payment=await gateway('payments/'+encodeURIComponent(paymentId));if(payment.order_id!==order.gateway_order_id)throw problem('Payment belongs to another order.',400);
  await recordCaptured(payment);res.json({success:true});
}));
export default router;
