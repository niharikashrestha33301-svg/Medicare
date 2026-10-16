import {createHash,randomUUID} from 'node:crypto';
import pool from '../config/db.js';
import {id,string,badRequest} from '../utils/validation.js';
import {problem} from './careSecurity.js';
export const cartSignature=items=>createHash('sha256').update(JSON.stringify(items.map(p=>[Number(p.id),Number(p.quantity),!!p.requires_prescription]).sort((a,b)=>a[0]-b[0]))).digest('hex');
export async function submitPrescriptionCheck(patientId,documentId){
 const c=await pool.getConnection();try{await c.beginTransaction();await c.query('SELECT id FROM users WHERE id=? FOR UPDATE',[patientId]);
 const [items]=await c.query('SELECT p.id,p.name,p.requires_prescription,c.quantity FROM pharmacy_cart c JOIN pharmacy_products p ON p.id=c.product_id WHERE c.patient_id=? ORDER BY p.id',[patientId]);
 if(!items.some(p=>p.requires_prescription))throw badRequest('Add prescription medicines to your cart before requesting verification.');
 const [[doc]]=await c.query('SELECT * FROM patient_health_documents WHERE id=? AND patient_id=?',[id(documentId,'prescription document'),patientId]);if(!doc)throw badRequest('Choose one of your own uploaded prescriptions.');
 const signature=cartSignature(items),[[prior]]=await c.query("SELECT id FROM pharmacy_prescription_checks WHERE patient_id=? AND document_id=? AND cart_signature=? AND status='Pending' AND created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 7 DAY) LIMIT 1",[patientId,doc.id,signature]);if(prior){await c.commit();return prior.id;}
 const key=randomUUID();await c.query('INSERT INTO pharmacy_prescription_checks(id,patient_id,document_id,cart_signature,items_json,filename,mime_type,content) VALUES(?,?,?,?,?,?,?,?)',[key,patientId,doc.id,signature,JSON.stringify(items.map(p=>({id:p.id,name:p.name,quantity:p.quantity}))),doc.filename,doc.mime_type,doc.content]);await c.commit();return key;
 }catch(e){await c.rollback();throw e;}finally{c.release();}
}
export async function approvedPrescription(c,patientId,items,reviewId){
 if(typeof reviewId!=='string')throw badRequest('Request pharmacist verification and select an approved prescription review before checkout.');
 const [[check]]=await c.query("SELECT * FROM pharmacy_prescription_checks WHERE id=? AND patient_id=? AND status='Approved' AND used_order IS NULL AND reviewed_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 7 DAY) FOR UPDATE",[reviewId,patientId]);
 if(!check||check.cart_signature!==cartSignature(items))throw problem('Pharmacist approval is missing, expired, already used, or your cart has changed. Request verification again.');
 const [[reviewer]]=await c.query("SELECT id FROM users WHERE id=? AND role='admin' AND status='Active'",[check.reviewed_by]);
 const ids=(process.env.PHARMACY_REVIEWER_IDS||'').split(',').map(s=>s.trim());if(!reviewer||!ids.includes(String(reviewer.id)))throw problem('Prescription reviewer authorization is no longer active. Request verification again.');return check;
}
