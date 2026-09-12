// 数据库连接与建表
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      contact TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      remark TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      contact TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      remark TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS parts (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      oe_code TEXT DEFAULT '',
      brand TEXT DEFAULT '',
      vehicle TEXT DEFAULT '',
      cost_price NUMERIC(12,2) DEFAULT 0,
      sell_price NUMERIC(12,2) DEFAULT 0,
      stock INT DEFAULT 0,
      min_stock INT DEFAULT 5,
      supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS inquiries (
      id SERIAL PRIMARY KEY,
      part_name TEXT NOT NULL,
      oe_code TEXT DEFAULT '',
      vehicle TEXT DEFAULT '',
      quantity INT DEFAULT 1,
      status TEXT DEFAULT 'open',
      chosen_quote_id INT,
      remark TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS inquiry_quotes (
      id SERIAL PRIMARY KEY,
      inquiry_id INT NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
      supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL,
      price NUMERIC(12,2) DEFAULT 0,
      delivery_days INT,
      remark TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id SERIAL PRIMARY KEY,
      supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL,
      status TEXT DEFAULT 'draft',
      total NUMERIC(12,2) DEFAULT 0,
      remark TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      id SERIAL PRIMARY KEY,
      purchase_id INT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      part_id INT REFERENCES parts(id) ON DELETE SET NULL,
      part_name TEXT NOT NULL,
      qty INT NOT NULL DEFAULT 1,
      price NUMERIC(12,2) DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      customer_id INT REFERENCES customers(id) ON DELETE SET NULL,
      total NUMERIC(12,2) DEFAULT 0,
      remark TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id SERIAL PRIMARY KEY,
      sale_id INT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      part_id INT REFERENCES parts(id) ON DELETE SET NULL,
      part_name TEXT NOT NULL,
      qty INT NOT NULL DEFAULT 1,
      price NUMERIC(12,2) DEFAULT 0,
      cost_price NUMERIC(12,2) DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_quotes_inquiry ON inquiry_quotes(inquiry_id);
    CREATE INDEX IF NOT EXISTS idx_pitems_purchase ON purchase_items(purchase_id);
    CREATE INDEX IF NOT EXISTS idx_sitems_sale ON sale_items(sale_id);
  `);
  console.log('[db] 表结构就绪');
}

module.exports = { pool, initDb };
