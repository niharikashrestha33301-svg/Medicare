import pool from '../config/db.js';
import {problem,validSignature} from './careSecurity.js';
export const paymentsConfigured=()=>!!(process.env.RAZORPAY_KEY_ID&&process.env.RAZORPAY_KEY_SECRET&&process.env.RAZORPAY_WEBHOOK_SECRET);
export async function gateway(path,method='GET',body){
  if(!paymentsConfigured())throw problem('Online payments are unavailable. Configure Razorpay credentials and webhook secret.',503);
  const response=await fetch('https://api.razorpay.com/v1/'+path,{method,signal:AbortSignal.timeout(15000),headers:{Authorization:'Basic '+Buffer.from(process.env.RAZORPAY_KEY_ID+':'+process.env.RAZORPAY_KEY_SECRET).toString('base64'),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok)throw problem('The payment gateway could not complete this request. Retry later.',502);return data;
}
export async function recordCaptured(payment){
  if(!payment||payment.status!=='captured'||payment.currency!=='INR'||!payment.id||!payment.order_id)throw problem('Payment has not been captured.',409);
  const connection=await pool.getConnection();try{await connection.beginTransaction();
    const [[order]]=await connection.query('SELECT * FROM pharmacy_orders WHERE gateway_order_id=? FOR UPDATE',[payment.order_id]);
    if(!order||order.total_paise!==payment.amount)throw problem('Payment does not match the order.',400);
    if(['Paid','Test paid'].includes(order.payment_status)){if(order.gateway_payment_id!==payment.id)throw problem('Order has a different payment.',409);await connection.commit();return;}
    if(order.status!=='Awaiting payment'||order.review_status==='Pending'||order.review_status==='Rejected')throw problem('Order is not eligible for payment. Contact the pharmacy.',409);
    const test=order.payment_mode==='Test';
    if(test){const [items]=await connection.query('SELECT product_id,quantity FROM pharmacy_order_items WHERE order_id=? ORDER BY product_id',[order.id]);for(const item of items)await connection.query('UPDATE pharmacy_products SET stock=stock+?,version=version+1 WHERE id=?',[item.quantity,item.product_id]);}
    await connection.query('UPDATE pharmacy_orders SET payment_status=?,gateway_payment_id=?,status=? WHERE id=?',[test?'Test paid':'Paid',payment.id,test?'Test complete':'Confirmed',order.id]);
    await connection.query('INSERT INTO pharmacy_order_events (order_id,status,note) VALUES (?,?,?)',[order.id,test?'Test complete':'Confirmed',test?'Razorpay sandbox payment verified; no real payment or fulfillment. Reserved stock released.':'Payment capture verified with Razorpay.']);await connection.commit();
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}
export async function paymentWebhook(req,res){
  try{
    if(!validSignature(req.body,req.get('X-Razorpay-Signature'),process.env.RAZORPAY_WEBHOOK_SECRET))return res.status(400).json({success:false,message:'Invalid webhook signature.'});
    const event=JSON.parse(req.body.toString('utf8'));
    if(event.event==='payment.captured')await recordCaptured(event.payload?.payment?.entity);
    res.json({success:true});
  }catch{res.status(409).json({success:false,message:'Payment event could not be reconciled. Retry or contact the pharmacy.'});}
}
