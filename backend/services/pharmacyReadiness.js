import pool from '../config/db.js';
import {paymentsConfigured} from './pharmacyPayments.js';
export const demoCheckoutEnabled=()=>process.env.NODE_ENV!=='production'&&process.env.PHARMACY_DEMO_ENABLED==='true';
export async function pharmacyReadiness(){
 const reviewerIds=(process.env.PHARMACY_REVIEWER_IDS||'').split(',').map(v=>v.trim()).filter(v=>/^[1-9]\d*$/.test(v));
 const [[reviewers]]=reviewerIds.length?await pool.query("SELECT COUNT(*) AS n FROM users WHERE id IN (?) AND role='admin' AND status='Active'",[reviewerIds]):[[{n:0}]];
 const [[inventory]]=await pool.query('SELECT COUNT(*) AS n FROM pharmacy_products p LEFT JOIN pharmacy_product_information i ON i.product_id=p.id WHERE p.active=TRUE AND p.is_demo=FALSE AND p.stock>0 AND p.price_paise>0 AND COALESCE(i.reference_only,FALSE)=FALSE');
 const cod=process.env.PHARMACY_COD_ENABLED==='true',onlinePayments=paymentsConfigured();
 const checks={enabled:process.env.PHARMACY_ENABLED==='true',authorizationAttested:process.env.PHARMACY_AUTHORIZED==='true'&&!!process.env.PHARMACY_LICENSE_REFERENCE?.trim(),reviewerConfigured:reviewers.n>0,inventoryPublished:inventory.n>0,paymentConfigured:cod||onlinePayments};
 const ordering=Object.values(checks).every(Boolean);
 const labels={enabled:'Operator must enable PHARMACY_ENABLED.',authorizationAttested:'Operator must confirm pharmacy authorization and configure PHARMACY_AUTHORIZED and PHARMACY_LICENSE_REFERENCE.',reviewerConfigured:'Assign an active authorized pharmacist admin in PHARMACY_REVIEWER_IDS.',inventoryPublished:'Publish actual in-stock medicine inventory.',paymentConfigured:'Configure a payment service or enable supported cash on delivery.'};
 return{demoCheckout:demoCheckoutEnabled(),ordering,cod,onlinePayments,paymentMode:process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test_')?'Test':'Live',checks,requirements:Object.keys(checks).filter(k=>!checks[k]).map(k=>labels[k]),message:ordering?(cod||!process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test_')?'Ordering enabled. Prescription medicines require pharmacist verification before dispensing.':'Sandbox checkout only. No real dispensing or delivery is enabled.'):demoCheckoutEnabled()?'Development demo: test checkout available. No payment, dispensing or delivery.':'Ordering unavailable. Pharmacy setup or authorization is incomplete.'};
}
