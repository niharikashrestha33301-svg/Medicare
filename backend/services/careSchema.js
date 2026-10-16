import pool from '../config/db.js';
import { ensureHealthSchema } from './healthSchema.js';
let ready;
export function ensureCareSchema() {
  if (!ready) ready=(async()=>{
    await ensureHealthSchema();
    const statements=[
      `CREATE TABLE IF NOT EXISTS video_consultations (
        id CHAR(36) PRIMARY KEY, appointment_id INT NOT NULL UNIQUE,
        status VARCHAR(20) NOT NULL DEFAULT 'Scheduled', admitted BOOLEAN NOT NULL DEFAULT FALSE,
        generation INT NOT NULL DEFAULT 0, patient_client CHAR(36) NULL, doctor_client CHAR(36) NULL,
        patient_seen DATETIME NULL, doctor_seen DATETIME NULL, started_at DATETIME NULL, ended_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS video_signals (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, consultation_id CHAR(36) NOT NULL,
        generation INT NOT NULL, sender_role VARCHAR(10) NOT NULL, payload TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX room_signals(consultation_id,generation,id),
        FOREIGN KEY(consultation_id) REFERENCES video_consultations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS pharmacy_products (
        id INT AUTO_INCREMENT PRIMARY KEY, sku VARCHAR(80) NOT NULL UNIQUE, name VARCHAR(180) NOT NULL,
        category VARCHAR(80) NOT NULL, description TEXT NOT NULL, manufacturer VARCHAR(160) NOT NULL,
        pack_size VARCHAR(100) NOT NULL, price_paise INT UNSIGNED NOT NULL,
        stock INT UNSIGNED NOT NULL DEFAULT 0, requires_prescription BOOLEAN NOT NULL DEFAULT TRUE,
        active BOOLEAN NOT NULL DEFAULT FALSE, version INT NOT NULL DEFAULT 0, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS pharmacy_cart (
        patient_id INT NOT NULL, product_id INT NOT NULL, quantity INT UNSIGNED NOT NULL,
        PRIMARY KEY(patient_id,product_id), FOREIGN KEY(patient_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(product_id) REFERENCES pharmacy_products(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS pharmacy_orders (
        id CHAR(36) PRIMARY KEY, patient_id INT NOT NULL, checkout_key CHAR(36) NOT NULL,
        status VARCHAR(30) NOT NULL, total_paise INT UNSIGNED NOT NULL, address VARCHAR(1000) NOT NULL,
        phone VARCHAR(30) NOT NULL, prescription_required BOOLEAN NOT NULL,
        review_status VARCHAR(20) NOT NULL DEFAULT 'Not required', reviewed_by INT NULL, review_note VARCHAR(1000) NOT NULL DEFAULT '',
        payment_status VARCHAR(30) NOT NULL DEFAULT 'Unpaid', payment_method VARCHAR(10) NOT NULL, payment_mode VARCHAR(8) NOT NULL DEFAULT 'Live',
        gateway_order_id VARCHAR(100) NULL UNIQUE, gateway_payment_id VARCHAR(100) NULL UNIQUE,
        payment_lease DATETIME NULL, carrier VARCHAR(120) NOT NULL DEFAULT '', tracking_number VARCHAR(160) NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY checkout_once(patient_id,checkout_key), INDEX patient_orders(patient_id,created_at),
        FOREIGN KEY(patient_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(reviewed_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS pharmacy_order_items (
        order_id CHAR(36) NOT NULL, product_id INT NOT NULL, name VARCHAR(180) NOT NULL,
        price_paise INT UNSIGNED NOT NULL, quantity INT UNSIGNED NOT NULL,
        PRIMARY KEY(order_id,product_id), FOREIGN KEY(order_id) REFERENCES pharmacy_orders(id) ON DELETE CASCADE,
        FOREIGN KEY(product_id) REFERENCES pharmacy_products(id)
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS pharmacy_order_documents (
        order_id CHAR(36) PRIMARY KEY, filename VARCHAR(180) NOT NULL, mime_type VARCHAR(50) NOT NULL,
        content MEDIUMBLOB NOT NULL, FOREIGN KEY(order_id) REFERENCES pharmacy_orders(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS pharmacy_order_events (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, order_id CHAR(36) NOT NULL,
        status VARCHAR(30) NOT NULL, note VARCHAR(1000) NOT NULL, actor_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX order_timeline(order_id,id),
        FOREIGN KEY(order_id) REFERENCES pharmacy_orders(id) ON DELETE CASCADE,
        FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB`
    ];
    for(const sql of statements)await pool.query(sql);
    const [image]=await pool.query("SHOW COLUMNS FROM pharmacy_products LIKE 'image_content'");
    if(!image.length)await pool.query("ALTER TABLE pharmacy_products ADD COLUMN image_content MEDIUMBLOB NULL, ADD COLUMN image_mime VARCHAR(20) NULL").catch(error=>{if(error.code!=='ER_DUP_FIELDNAME')throw error;});
    const [demo]=await pool.query("SHOW COLUMNS FROM pharmacy_products LIKE 'is_demo'");
    if(!demo.length)await pool.query("ALTER TABLE pharmacy_products ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE").catch(e=>{if(e.code!=='ER_DUP_FIELDNAME')throw e;});
    await pool.query(`CREATE TABLE IF NOT EXISTS pharmacy_prescription_checks (
      id CHAR(36) PRIMARY KEY,patient_id INT NOT NULL,document_id INT NULL,cart_signature CHAR(64) NOT NULL,items_json TEXT NOT NULL,
      filename VARCHAR(180) NOT NULL,mime_type VARCHAR(50) NOT NULL,content MEDIUMBLOB NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'Pending',reviewed_by INT NULL,note VARCHAR(1000) NOT NULL DEFAULT '',used_order CHAR(36) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_at DATETIME NULL,
      INDEX patient_checks(patient_id,created_at),FOREIGN KEY(patient_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(document_id) REFERENCES patient_health_documents(id) ON DELETE SET NULL
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS pharmacy_product_information (
      product_id INT PRIMARY KEY,brand VARCHAR(160) NOT NULL DEFAULT '',strength VARCHAR(200) NOT NULL DEFAULT '',
      source_url VARCHAR(1000) NOT NULL DEFAULT '',source_name VARCHAR(180) NOT NULL DEFAULT '',source_checked_at DATETIME NULL,
      reference_only BOOLEAN NOT NULL DEFAULT FALSE,image_verified BOOLEAN NOT NULL DEFAULT FALSE,image_rights_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
      clinical_verified BOOLEAN NOT NULL DEFAULT FALSE,usage_text TEXT NOT NULL,precautions_text TEXT NOT NULL,
      verified_by INT NULL,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES pharmacy_products(id) ON DELETE CASCADE,FOREIGN KEY(verified_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB`);
    const [mode]=await pool.query("SHOW COLUMNS FROM pharmacy_orders LIKE 'payment_mode'");
    if(!mode.length)await pool.query("ALTER TABLE pharmacy_orders ADD COLUMN payment_mode VARCHAR(8) NOT NULL DEFAULT 'Live'").catch(error=>{if(error.code!=='ER_DUP_FIELDNAME')throw error;});
  })().catch(error=>{ready=null;throw error;});
  return ready;
}
