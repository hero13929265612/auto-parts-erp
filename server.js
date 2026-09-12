// 汽配批发零售简版 ERP — 云端版（Render + PostgreSQL）
// 使用方式：部署到 Render（Blueprint），数据库自动创建（render.yaml 配置）
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const { pool, initDb } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============ 登录与鉴权 ============
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const tokens = new Set();

app.post('/api/login', (req, res) => {
  if (req.body && req.body.password === ADMIN_PASSWORD) {
    const t = crypto.randomBytes(24).toString('hex');
    tokens.add(t);
    res.json({ token: t });
  } else {
    res.status(401).json({ error: '密码错误' });
  }
});

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (tokens.has(t)) return next();
  res.status(401).json({ error: '未登录或登录已过期' });
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

const fail = (res, e) => res.status(500).json({ error: e.message || '服务器错误' });

// ============ 配件 ============
app.get('/api/parts', auth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    let sql = `SELECT p.*, s.name AS supplier_name FROM parts p
               LEFT JOIN suppliers s ON s.id = p.supplier_id`;
    const params = [];
    if (q) {
      sql += ` WHERE p.name ILIKE $1 OR p.oe_code ILIKE $1 OR p.brand ILIKE $1 OR p.vehicle ILIKE $1`;
      params.push('%' + q + '%');
    }
    sql += ' ORDER BY p.id DESC';
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (e) { fail(res, e); }
});

app.post('/api/parts', auth, async (req, res) => {
  try {
    const b = req.body || {};
    const { rows } = await pool.query(
      `INSERT INTO parts (name, oe_code, brand, vehicle, cost_price, sell_price, stock, min_stock, supplier_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [b.name, b.oe_code || '', b.brand || '', b.vehicle || '', b.cost_price || 0, b.sell_price || 0,
       b.stock || 0, b.min_stock == null ? 5 : b.min_stock, b.supplier_id || null]);
    res.json(rows[0]);
  } catch (e) { fail(res, e); }
});

app.put('/api/parts/:id', auth, async (req, res) => {
  try {
    const b = req.body || {};
    const { rows } = await pool.query(
      `UPDATE parts SET name=$1, oe_code=$2, brand=$3, vehicle=$4, cost_price=$5, sell_price=$6, stock=$7, min_stock=$8, supplier_id=$9
       WHERE id=$10 RETURNING *`,
      [b.name, b.oe_code || '', b.brand || '', b.vehicle || '', b.cost_price || 0, b.sell_price || 0,
       b.stock || 0, b.min_stock == null ? 5 : b.min_stock, b.supplier_id || null, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: '配件不存在' });
    res.json(rows[0]);
  } catch (e) { fail(res, e); }
});

app.delete('/api/parts/:id', auth, async (req, res) => {
  try { await pool.query('DELETE FROM parts WHERE id=$1', [req.params.id]); res.json({ ok: true }); }
  catch (e) { fail(res, e); }
});

// ============ 供应商 ============
app.get('/api/suppliers', auth, async (req, res) => {
  try { const { rows } = await pool.query('SELECT * FROM suppliers ORDER BY id DESC'); res.json(rows); }
  catch (e) { fail(res, e); }
});

app.post('/api/suppliers', auth, async (req, res) => {
  try {
    const b = req.body || {};
    const { rows } = await pool.query(
      'INSERT INTO suppliers (name, contact, phone, remark) VALUES ($1,$2,$3,$4) RETURNING *',
      [b.name, b.contact || '', b.phone || '', b.remark || '']);
    res.json(rows[0]);
  } catch (e) { fail(res, e); }
});

app.put('/api/suppliers/:id', auth, async (req, res) => {
  try {
    const b = req.body || {};
    const { rows } = await pool.query(
      'UPDATE suppliers SET name=$1, contact=$2, phone=$3, remark=$4 WHERE id=$5 RETURNING *',
      [b.name, b.contact || '', b.phone || '', b.remark || '', req.params.id]);
    if (!rows.length) return res.status(404).json({ error: '供应商不存在' });
    res.json(rows[0]);
  } catch (e) { fail(res, e); }
});

app.delete('/api/suppliers/:id', auth, async (req, res) => {
  try { await pool.query('DELETE FROM suppliers WHERE id=$1', [req.params.id]); res.json({ ok: true }); }
  catch (e) { fail(res, e); }
});

// ============ 客户 ============
app.get('/api/customers', auth, async (req, res) => {
  try { const { rows } = await pool.query('SELECT * FROM customers ORDER BY id DESC'); res.json(rows); }
  catch (e) { fail(res, e); }
});

app.post('/api/customers', auth, async (req, res) => {
  try {
    const b = req.body || {};
    const { rows } = await pool.query(
      'INSERT INTO customers (name, contact, phone, remark) VALUES ($1,$2,$3,$4) RETURNING *',
      [b.name, b.contact || '', b.phone || '', b.remark || '']);
    res.json(rows[0]);
  } catch (e) { fail(res, e); }
});

app.put('/api/customers/:id', auth, async (req, res) => {
  try {
    const b = req.body || {};
    const { rows } = await pool.query(
      'UPDATE customers SET name=$1, contact=$2, phone=$3, remark=$4 WHERE id=$5 RETURNING *',
      [b.name, b.contact || '', b.phone || '', b.remark || '', req.params.id]);
    if (!rows.length) return res.status(404).json({ error: '客户不存在' });
    res.json(rows[0]);
  } catch (e) { fail(res, e); }
});

app.delete('/api/customers/:id', auth, async (req, res) => {
  try { await pool.query('DELETE FROM customers WHERE id=$1', [req.params.id]); res.json({ ok: true }); }
  catch (e) { fail(res, e); }
});

// ============ 询价与比价 ============
app.post('/api/inquiries', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const b = req.body || {};
    const q = await client.query(
      `INSERT INTO inquiries (part_name, oe_code, vehicle, quantity, status) VALUES ($1,$2,$3,$4,'open') RETURNING *`,
      [b.part_name, b.oe_code || '', b.vehicle || '', b.quantity || 1]);
    const inq = q.rows[0];
    const quotes = Array.isArray(b.quotes) ? b.quotes : [];
    let minId = null, minPrice = Infinity;
    for (const qt of quotes) {
      const price = Number(qt.price) || 0;
      const r = await client.query(
        `INSERT INTO inquiry_quotes (inquiry_id, supplier_id, price, delivery_days, remark) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [inq.id, qt.supplier_id || null, price, qt.delivery_days == null ? null : qt.delivery_days, qt.remark || '']);
      if (price < minPrice) { minPrice = price; minId = r.rows[0].id; }
    }
    if (minId != null) await client.query('UPDATE inquiries SET chosen_quote_id=$1 WHERE id=$2', [minId, inq.id]);
    await client.query('COMMIT');
    res.json({ id: inq.id });
  } catch (e) { await client.query('ROLLBACK'); fail(res, e); }
  finally { client.release(); }
});

app.get('/api/inquiries', auth, async (req, res) => {
  try {
    const { rows: inqs } = await pool.query('SELECT * FROM inquiries ORDER BY id DESC LIMIT 200');
    const { rows: quotes } = await pool.query('SELECT * FROM inquiry_quotes');
    const { rows: sups } = await pool.query('SELECT id, name FROM suppliers');
    const supMap = new Map(sups.map(s => [s.id, s.name]));
    const qByInq = {};
    for (const q of quotes) {
      (qByInq[q.inquiry_id] = qByInq[q.inquiry_id] || []).push(Object.assign({}, q, { supplier_name: q.supplier_id ? (supMap.get(q.supplier_id) || '') : '' }));
    }
    const out = inqs.map(i => {
      const list = (qByInq[i.id] || []).sort((a, b) => a.price - b.price);
      const chosen = list.find(x => x.id === i.chosen_quote_id) || null;
      return Object.assign({}, i, {
        chosen_supplier_id: chosen ? chosen.supplier_id : null,
        chosen_supplier_name: chosen ? (supMap.get(chosen.supplier_id) || '') : '',
        chosen_price: chosen ? chosen.price : null,
        chosen_delivery: chosen ? chosen.delivery_days : null,
        quotes: list
      });
    });
    res.json(out);
  } catch (e) { fail(res, e); }
});

app.post('/api/inquiries/:id/choose', auth, async (req, res) => {
  try {
    await pool.query('UPDATE inquiries SET chosen_quote_id=$1 WHERE id=$2', [(req.body || {}).quote_id || null, req.params.id]);
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

app.post('/api/inquiries/:id/close', auth, async (req, res) => {
  try { await pool.query('UPDATE inquiries SET status=$1 WHERE id=$2', ['closed', req.params.id]); res.json({ ok: true }); }
  catch (e) { fail(res, e); }
});

app.delete('/api/inquiries/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM inquiry_quotes WHERE inquiry_id=$1', [req.params.id]);
    await pool.query('DELETE FROM inquiries WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

// ============ 采购（草稿 → 确认 → 收货入库） ============
app.post('/api/purchases', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const b = req.body || {};
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) return res.status(400).json({ error: '采购单至少需要一项' });
    let total = 0;
    for (const it of items) total += Number(it.qty || 0) * Number(it.price || 0);
    const p = await client.query(
      `INSERT INTO purchases (supplier_id, status, total, remark) VALUES ($1,'draft',$2,$3) RETURNING *`,
      [b.supplier_id || null, total, b.remark || '']);
    for (const it of items) {
      await client.query(
        `INSERT INTO purchase_items (purchase_id, part_id, part_name, qty, price) VALUES ($1,$2,$3,$4,$5)`,
        [p.rows[0].id, it.part_id || null, it.part_name, it.qty || 1, it.price || 0]);
    }
    await client.query('COMMIT');
    res.json({ id: p.rows[0].id });
  } catch (e) { await client.query('ROLLBACK'); fail(res, e); }
  finally { client.release(); }
});

app.get('/api/purchases', auth, async (req, res) => {
  try {
    const { rows: ps } = await pool.query('SELECT * FROM purchases ORDER BY id DESC LIMIT 200');
    const { rows: its } = await pool.query('SELECT * FROM purchase_items');
    const { rows: sups } = await pool.query('SELECT id, name FROM suppliers');
    const supMap = new Map(sups.map(s => [s.id, s.name]));
    const itByP = {};
    for (const it of its) (itByP[it.purchase_id] = itByP[it.purchase_id] || []).push(it);
    res.json(ps.map(p => Object.assign({}, p, {
      supplier_name: p.supplier_id ? (supMap.get(p.supplier_id) || '') : '',
      items: itByP[p.id] || []
    })));
  } catch (e) { fail(res, e); }
});

app.post('/api/purchases/:id/confirm', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('UPDATE purchases SET status=$1 WHERE id=$2 AND status=$3 RETURNING *', ['confirmed', req.params.id, 'draft']);
    if (!rows.length) return res.status(400).json({ error: '只有草稿状态可确认' });
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

app.post('/api/purchases/:id/receive', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const p = await client.query('SELECT * FROM purchases WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!p.rows.length || p.rows[0].status !== 'confirmed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '只有已确认的采购单可收货' });
    }
    const its = await client.query('SELECT * FROM purchase_items WHERE purchase_id=$1', [req.params.id]);
    for (const it of its.rows) {
      if (it.part_id != null) {
        await client.query('UPDATE parts SET stock = stock + $1 WHERE id=$2', [it.qty, it.part_id]);
      }
    }
    await client.query('UPDATE purchases SET status=$1 WHERE id=$2', ['received', req.params.id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) { await client.query('ROLLBACK'); fail(res, e); }
  finally { client.release(); }
});

app.delete('/api/purchases/:id', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const p = await client.query('SELECT * FROM purchases WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!p.rows.length || p.rows[0].status !== 'draft') {
      await client.query('ROLLBACK');
      return res.json({ ok: false });
    }
    await client.query('DELETE FROM purchase_items WHERE purchase_id=$1', [req.params.id]);
    await client.query('DELETE FROM purchases WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) { await client.query('ROLLBACK'); fail(res, e); }
  finally { client.release(); }
});

// ============ 销售（出库 + 毛利） ============
app.post('/api/sales', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const b = req.body || {};
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: '销售单至少需要一项' }); }
    let total = 0;
    const resolved = [];
    for (const it of items) {
      const r = await client.query('SELECT * FROM parts WHERE id=$1 FOR UPDATE', [it.part_id]);
      if (!r.rows.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: '配件不存在: ' + it.part_name }); }
      const part = r.rows[0];
      if (part.stock < Number(it.qty || 0)) { await client.query('ROLLBACK'); return res.status(400).json({ error: '库存不足: ' + it.part_name }); }
      total += Number(it.qty || 0) * Number(it.price || 0);
      resolved.push({ part, qty: Number(it.qty) || 1, price: Number(it.price) || 0 });
    }
    const s = await client.query('INSERT INTO sales (customer_id, total, remark) VALUES ($1,$2,$3) RETURNING *',
      [b.customer_id || null, total, b.remark || '']);
    for (const r of resolved) {
      await client.query(
        `INSERT INTO sale_items (sale_id, part_id, part_name, qty, price, cost_price) VALUES ($1,$2,$3,$4,$5,$6)`,
        [s.rows[0].id, r.part.id, r.part.name, r.qty, r.price, r.part.cost_price]);
      await client.query('UPDATE parts SET stock = stock - $1 WHERE id=$2', [r.qty, r.part.id]);
    }
    await client.query('COMMIT');
    res.json({ id: s.rows[0].id });
  } catch (e) { await client.query('ROLLBACK'); fail(res, e); }
  finally { client.release(); }
});

app.get('/api/sales', auth, async (req, res) => {
  try {
    const { rows: ss } = await pool.query('SELECT * FROM sales ORDER BY id DESC LIMIT 200');
    const { rows: its } = await pool.query('SELECT * FROM sale_items');
    const { rows: cus } = await pool.query('SELECT id, name FROM customers');
    const cusMap = new Map(cus.map(c => [c.id, c.name]));
    const itByS = {};
    for (const it of its) (itByS[it.sale_id] = itByS[it.sale_id] || []).push(Object.assign({}, it, { profit: (Number(it.price) - Number(it.cost_price)) * it.qty }));
    res.json(ss.map(s => Object.assign({}, s, {
      customer_name: s.customer_id ? (cusMap.get(s.customer_id) || '') : '',
      items: itByS[s.id] || []
    })));
  } catch (e) { fail(res, e); }
});

app.delete('/api/sales/:id', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const its = await client.query('SELECT * FROM sale_items WHERE sale_id=$1 FOR UPDATE', [req.params.id]);
    if (!its.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: '销售单不存在' }); }
    for (const it of its.rows) {
      if (it.part_id != null) {
        await client.query('UPDATE parts SET stock = stock + $1 WHERE id=$2', [it.qty, it.part_id]);
      }
    }
    await client.query('DELETE FROM sale_items WHERE sale_id=$1', [req.params.id]);
    await client.query('DELETE FROM sales WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) { await client.query('ROLLBACK'); fail(res, e); }
  finally { client.release(); }
});

// ============ 库存与统计 ============
app.get('/api/inventory/low', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, s.name AS supplier_name FROM parts p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.stock <= p.min_stock
       ORDER BY (p.stock - p.min_stock) ASC`);
    res.json(rows);
  } catch (e) { fail(res, e); }
});

app.get('/api/stats', auth, async (req, res) => {
  try {
    const stockValue = (await pool.query('SELECT COALESCE(SUM(cost_price * stock),0) AS v FROM parts')).rows[0].v;
    const lowCount = (await pool.query('SELECT COUNT(*)::int AS c FROM parts WHERE stock <= min_stock')).rows[0].c;
    const partCount = (await pool.query('SELECT COUNT(*)::int AS c FROM parts')).rows[0].c;
    const monthPurchase = (await pool.query(
      `SELECT COALESCE(SUM(total),0) AS v FROM purchases
       WHERE status IN ('confirmed','received') AND created_at >= date_trunc('month', now())`)).rows[0].v;
    const monthSales = (await pool.query(
      `SELECT COALESCE(SUM(total),0) AS v FROM sales WHERE created_at >= date_trunc('month', now())`)).rows[0].v;
    const monthProfit = (await pool.query(
      `SELECT COALESCE(SUM((price - cost_price) * qty),0) AS v FROM sale_items si
       JOIN sales s ON s.id = si.sale_id WHERE s.created_at >= date_trunc('month', now())`)).rows[0].v;
    res.json({ stockValue, lowCount, monthPurchase, monthSales, monthProfit, partCount });
  } catch (e) { fail(res, e); }
});

// 启动（先初始化数据库表）
const PORT = process.env.PORT || 3000;
initDb().then(() => {
  app.listen(PORT, () => {
    console.log('汽配 ERP（云端版）已启动: http://localhost:' + PORT);
  });
}).catch(e => {
  console.error('数据库初始化失败，请检查 DATABASE_URL：' + e.message);
  process.exit(1);
});
