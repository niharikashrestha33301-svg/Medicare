import pool from '../config/db.js';
import {ensureCareSchema} from './careSchema.js';
import {purgeCloudVideoSignals} from './videoStore.js';
import {syncPendingAppointments} from './appointmentSync.js';
import {expireFleet} from './ambulanceFleet.js';
let running=false;
export async function maintainCare(){
  if(running)return;running=true;
  try{await ensureCareSchema();
    await expireFleet();
    // Signaling data contains network information; retain it only for negotiation.
    await pool.query('DELETE FROM video_signals WHERE created_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 MINUTE)');
    await syncPendingAppointments().catch(()=>console.error('Appointment synchronization retry unavailable.'));
    await purgeCloudVideoSignals().catch(()=>console.error('Supabase signaling retention check unavailable. Check video database configuration.'));
    const [expired]=await pool.query("SELECT id FROM pharmacy_orders WHERE status IN ('Awaiting review','Awaiting payment') AND gateway_order_id IS NULL AND payment_lease IS NULL AND created_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR) ORDER BY id LIMIT 100");
    for(const row of expired){const connection=await pool.getConnection();try{await connection.beginTransaction();
      const [[order]]=await connection.query("SELECT * FROM pharmacy_orders WHERE id=? AND status IN ('Awaiting review','Awaiting payment') AND gateway_order_id IS NULL AND payment_lease IS NULL AND created_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR) FOR UPDATE",[row.id]);
      if(order){const [items]=await connection.query('SELECT product_id,quantity FROM pharmacy_order_items WHERE order_id=? ORDER BY product_id',[order.id]);for(const item of items)await connection.query('UPDATE pharmacy_products SET stock=stock+?,version=version+1 WHERE id=?',[item.quantity,item.product_id]);
        await connection.query("UPDATE pharmacy_orders SET status='Expired' WHERE id=?",[order.id]);await connection.query("INSERT INTO pharmacy_order_events (order_id,status,note) VALUES (?,'Expired','Unpaid or unreviewed reservation expired after 24 hours; stock released.')",[order.id]);}
      await connection.commit();
    }catch(error){await connection.rollback();throw error;}finally{connection.release();}}
  }finally{running=false;}
}
export function startCareMaintenance(){const tick=()=>maintainCare().catch(error=>console.error('Care maintenance:',error.code||'Unavailable'));tick();const timer=setInterval(tick,60000);timer.unref();return timer;}
