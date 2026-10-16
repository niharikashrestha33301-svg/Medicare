import express from 'express';
import {randomUUID} from 'node:crypto';
import pool from '../config/db.js';
import {protect,authorizeRoles} from '../middleware/authMiddleware.js';
import {string,date,today,id,badRequest,fail} from '../utils/validation.js';
const router=express.Router();
const catalog=new Map([['Complete Blood Count (CBC)',299],['Lipid Profile Panel',499],['Blood Sugar (Fasting & PP)',199],['Thyroid Panel (T3, T4, TSH)',799],['Liver Function Test (LFT)',599],['Kidney Function Test (KFT)',599],['COVID-19 RT-PCR Test',499],['Vitamin D & B12 Panel',999],['Full Body Health Checkup',1999]]);
let ready;
function schema(){return ready ||= pool.query(`CREATE TABLE IF NOT EXISTS patient_lab_bookings (
 id INT AUTO_INCREMENT PRIMARY KEY, booking_code VARCHAR(50) NOT NULL UNIQUE, patient_id INT NOT NULL,
 test_name VARCHAR(150) NOT NULL, price DECIMAL(10,2) NOT NULL, collection_date DATE NOT NULL,
 preference ENUM('Home Collection','Visit Lab') NOT NULL, patient_name VARCHAR(150) NOT NULL,
 phone VARCHAR(30) NOT NULL,email VARCHAR(254) NOT NULL,address VARCHAR(1000) NOT NULL,
 status ENUM('Requested','Cancelled') NOT NULL DEFAULT 'Requested',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(patient_id) REFERENCES users(id) ON DELETE CASCADE, INDEX patient_history(patient_id,id),
 active_date DATE GENERATED ALWAYS AS (CASE WHEN status='Requested' THEN collection_date ELSE NULL END) STORED,
 UNIQUE KEY duplicate_request(patient_id,test_name,active_date,preference)
 ) ENGINE=InnoDB`).catch(e=>{ready=null;throw e;});}
router.use(protect,authorizeRoles('patient'));
router.get('/my',async(req,res)=>{try{await schema();const [bookings]=await pool.query("SELECT id,booking_code AS bookingCode,test_name AS testName,price,DATE_FORMAT(collection_date,'%Y-%m-%d') AS collectionDate,preference,patient_name AS patientName,phone,email,address,status,created_at AS createdAt FROM patient_lab_bookings WHERE patient_id=? ORDER BY id DESC",[req.user.id]);res.json({success:true,bookings});}catch(e){fail(res,e);}});
router.post('/',async(req,res)=>{try{
 await schema();const b=req.body,test=string(b.testName,'test',150),price=catalog.get(test);if(price===undefined)throw badRequest('Choose a listed lab test.');
 const day=date(b.collectionDate);if(day<today())throw badRequest('Choose today or a future collection date.');
 if(!['Home Collection','Visit Lab'].includes(b.preference))throw badRequest('Choose a collection preference.');
 const name=string(b.patientName,'patient name',150),phone=string(b.phone,'phone',30),address=string(b.address||'','address',1000,b.preference==='Home Collection');
 const code='LAB-'+randomUUID();const [result]=await pool.query('INSERT INTO patient_lab_bookings(booking_code,patient_id,test_name,price,collection_date,preference,patient_name,phone,email,address) VALUES(?,?,?,?,?,?,?,?,?,?)',[code,req.user.id,test,price,day,b.preference,name,phone,req.user.email,address]);
 res.status(201).json({success:true,bookingId:result.insertId,bookingCode:code,status:'Requested',message:'Request saved. Lab acceptance and collection time are not yet confirmed.'});
 }catch(e){fail(res,e);}});
router.put('/:id/cancel',async(req,res)=>{try{await schema();const bookingId=id(req.params.id);const [[booking]]=await pool.query('SELECT status FROM patient_lab_bookings WHERE id=? AND patient_id=?',[bookingId,req.user.id]);if(!booking)return res.status(404).json({success:false,message:'Test booking not found.'});if(booking.status!=='Cancelled')await pool.query("UPDATE patient_lab_bookings SET status='Cancelled' WHERE id=? AND patient_id=?",[bookingId,req.user.id]);res.json({success:true});}catch(e){fail(res,e);}});
export default router;
