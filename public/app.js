/* 汽配 ERP 前端逻辑 */
(function () {
  'use strict';

  // ---------- 工具 ----------
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function fmt(n) {
    return '¥' + Number(n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function dt(s) {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d)) return String(s).slice(0, 10);
    return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  }

  let token = localStorage.getItem('erp_token') || '';
  const cache = { suppliers: [], customers: [], parts: [] };

  async function api(path, method, body) {
    const opt = { method: method || 'GET', headers: { 'Authorization': 'Bearer ' + token } };
    if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    let r;
    try { r = await fetch(path, opt); }
    catch (e) { throw new Error('网络错误，请检查网络或稍后重试'); }
    if (r.status === 401) { logout(); throw new Error('登录已过期，请重新登录'); }
    let d = {};
    try { d = await r.json(); } catch (e) { /* 非 JSON 响应 */ }
    if (!r.ok) throw new Error(d.error || '请求失败(' + r.status + ')');
    return d;
  }

  let toastTimer = null;
  function toast(msg, isErr) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, 2600);
  }

  // ---------- 弹窗 ----------
  function openModal(title, bodyHtml, actionsHtml) {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = bodyHtml;
    $('#modal-actions').innerHTML = actionsHtml || '';
    $('#modal-mask').style.display = 'flex';
  }
  window.closeModal = function () { $('#modal-mask').style.display = 'none'; };

  // ---------- 登录 / 登出 ----------
  function login() {
    const pwd = $('#login-password').value;
    if (!pwd) { $('#login-msg').textContent = '请输入密码'; return; }
    fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pwd }) })
      .then(r => r.json())
      .then(d => {
        if (d.token) {
          token = d.token;
          localStorage.setItem('erp_token', token);
          enterApp();
        } else { $('#login-msg').textContent = d.error || '登录失败'; }
      })
      .catch(() => { $('#login-msg').textContent = '网络错误，请稍后重试'; });
  }

  function logout() {
    token = '';
    localStorage.removeItem('erp_token');
    $('#app-view').style.display = 'none';
    $('#login-view').style.display = 'flex';
    $('#login-password').value = '';
    $('#login-msg').textContent = '';
  }

  async function enterApp() {
    $('#login-view').style.display = 'none';
    $('#app-view').style.display = 'flex';
    try {
      await loadBase();
    } catch (e) { /* 401 已由 api 处理 */ }
    switchPage('home');
  }

  async function loadBase() {
    const [sup, cus, parts] = await Promise.all([
      api('/api/suppliers'), api('/api/customers'), api('/api/parts')
    ]);
    cache.suppliers = sup; cache.customers = cus; cache.parts = parts;
  }

  // ---------- 导航 ----------
  function switchPage(name) {
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === name));
    $$('.page').forEach(p => p.style.display = 'none');
    const el = $('#page-' + name);
    el.style.display = 'block';
    const renderers = { home: renderHome, parts: renderParts, suppliers: renderSuppliers, customers: renderCustomers, inquiries: renderInquiries, purchases: renderPurchases, sales: renderSales, inventory: renderInventory };
    (renderers[name] || renderHome)();
  }

  // ---------- 工作台 ----------
  async function renderHome() {
    const s = await api('/api/stats');
    $('#page-home').innerHTML = `
      <div class="page-head"><div class="page-title">工作台</div></div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-label">库存成本总值</div><div class="stat-value blue money">${fmt(s.stockValue)}</div></div>
        <div class="stat-card"><div class="stat-label">配件种类</div><div class="stat-value">${s.partCount}</div></div>
        <div class="stat-card"><div class="stat-label">低库存预警</div><div class="stat-value warn">${s.lowCount} 项</div></div>
        <div class="stat-card"><div class="stat-label">本月采购金额</div><div class="stat-value money">${fmt(s.monthPurchase)}</div></div>
        <div class="stat-card"><div class="stat-label">本月销售金额</div><div class="stat-value green money">${fmt(s.monthSales)}</div></div>
        <div class="stat-card"><div class="stat-label">本月毛利</div><div class="stat-value green money">${fmt(s.monthProfit)}</div></div>
      </div>
      <div class="card">
        <div style="font-size:15px;font-weight:600;margin-bottom:10px;">快捷操作</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;">
          <button class="btn btn-primary" onclick="switchPage('parts')">管理配件档案</button>
          <button class="btn btn-primary" onclick="switchPage('inquiries')">新建询价比价</button>
          <button class="btn btn-success" onclick="switchPage('purchases')">新建采购入库</button>
          <button class="btn btn-success" onclick="switchPage('sales')">新建销售出库</button>
          <button class="btn btn-warn" onclick="switchPage('inventory')">查看库存预警</button>
        </div>
      </div>`;
  }

  // ---------- 配件 ----------
  let partsQuery = '';
  async function renderParts() {
    let list;
    try { list = await api('/api/parts' + (partsQuery ? '?q=' + encodeURIComponent(partsQuery) : '')); }
    catch (e) { toast(e.message, true); return; }
    const rows = list.map(p => `
      <tr>
        <td>${p.id}</td>
        <td><b>${esc(p.name)}</b></td>
        <td>${esc(p.oe_code)}</td>
        <td>${esc(p.brand)}</td>
        <td>${esc(p.vehicle)}</td>
        <td class="money">${fmt(p.cost_price)}</td>
        <td class="money">${fmt(p.sell_price)}</td>
        <td class="money">${p.stock}${p.stock <= p.min_stock ? ' <span class="tag tag-low">低</span>' : ''}</td>
        <td>${p.min_stock}</td>
        <td>${esc(p.supplier_name || '-')}</td>
        <td>
          <button class="btn btn-light btn-sm" onclick="openPartForm(${p.id})">编辑</button>
          <button class="btn btn-danger btn-sm" onclick="delPart(${p.id})">删除</button>
        </td>
      </tr>`).join('');
    $('#page-parts').innerHTML = `
      <div class="page-head">
        <div class="page-title">配件档案</div>
        <div class="toolbar">
          <input id="parts-search" placeholder="搜索名称 / OE码 / 品牌 / 车型" value="${esc(partsQuery)}">
          <button class="btn btn-primary" onclick="openPartForm()">+ 新增配件</button>
        </div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>ID</th><th>名称</th><th>OE码</th><th>品牌</th><th>车型</th><th>进价</th><th>售价</th><th>库存</th><th>预警线</th><th>常用供应商</th><th>操作</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="11" class="empty">暂无配件，点右上角新增</td></tr>'}</tbody>
      </table></div>`;
    const si = $('#parts-search');
    si.oninput = function () { partsQuery = si.value.trim(); clearTimeout(si._t); si._t = setTimeout(renderParts, 350); };
  }

  window.openPartForm = function (id) {
    const p = id ? cache.parts.find(x => x.id === id) : null;
    const supOpts = cache.suppliers.map(s => `<option value="${s.id}" ${p && p.supplier_id == s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    openModal(p ? '编辑配件 #' + id : '新增配件', `
      <div class="form-grid">
        <div class="field"><label>配件名称 *</label><input id="f-name" value="${esc(p ? p.name : '')}" placeholder="如：前刹车片"></div>
        <div class="field"><label>OE 码</label><input id="f-oe" value="${esc(p ? p.oe_code : '')}"></div>
        <div class="field"><label>品牌</label><input id="f-brand" value="${esc(p ? p.brand : '')}"></div>
        <div class="field"><label>适用车型</label><input id="f-vehicle" value="${esc(p ? p.vehicle : '')}"></div>
        <div class="field"><label>进价（元）</label><input id="f-cost" type="number" step="0.01" min="0" value="${p ? p.cost_price : ''}"></div>
        <div class="field"><label>售价（元）</label><input id="f-sell" type="number" step="0.01" min="0" value="${p ? p.sell_price : ''}"></div>
        <div class="field"><label>当前库存</label><input id="f-stock" type="number" min="0" value="${p ? p.stock : 0}"></div>
        <div class="field"><label>最低库存预警线</label><input id="f-min" type="number" min="0" value="${p ? p.min_stock : 5}"></div>
        <div class="field"><label>常用供应商</label><select id="f-supplier"><option value="">（无）</option>${supOpts}</select></div>
      </div>`,
      `<button class="btn btn-light" onclick="closeModal()">取消</button>
       <button class="btn btn-primary" onclick="savePart(${id || 0})">保存</button>`);
  };

  window.savePart = async function (id) {
    const body = {
      name: $('#f-name').value.trim(), oe_code: $('#f-oe').value.trim(), brand: $('#f-brand').value.trim(),
      vehicle: $('#f-vehicle').value.trim(), cost_price: $('#f-cost').value || 0, sell_price: $('#f-sell').value || 0,
      stock: $('#f-stock').value || 0, min_stock: $('#f-min').value == null ? 5 : $('#f-min').value,
      supplier_id: $('#f-supplier').value || null
    };
    if (!body.name) { toast('配件名称必填', true); return; }
    try {
      if (id) { await api('/api/parts/' + id, 'PUT', body); toast('已保存'); }
      else { await api('/api/parts', 'POST', body); toast('已新增'); }
      closeModal(); await loadBase(); renderParts();
    } catch (e) { toast(e.message, true); }
  };

  window.delPart = async function (id) {
    if (!confirm('确认删除该配件？历史订单记录不受影响。')) return;
    try { await api('/api/parts/' + id, 'DELETE'); toast('已删除'); await loadBase(); renderParts(); }
    catch (e) { toast(e.message, true); }
  };

  // ---------- 供应商 ----------
  async function renderSuppliers() {
    let list;
    try { list = await api('/api/suppliers'); cache.suppliers = list; }
    catch (e) { toast(e.message, true); return; }
    const rows = list.map(s => `
      <tr><td>${s.id}</td><td><b>${esc(s.name)}</b></td><td>${esc(s.contact)}</td><td>${esc(s.phone)}</td><td>${esc(s.remark)}</td>
        <td><button class="btn btn-light btn-sm" onclick="openSupForm(${s.id})">编辑</button>
        <button class="btn btn-danger btn-sm" onclick="delSup(${s.id})">删除</button></td></tr>`).join('');
    $('#page-suppliers').innerHTML = `
      <div class="page-head"><div class="page-title">供应商</div>
        <div><button class="btn btn-primary" onclick="openSupForm()">+ 新增供应商</button></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>ID</th><th>名称</th><th>联系人</th><th>电话</th><th>备注</th><th>操作</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="empty">暂无供应商</td></tr>'}</tbody>
      </table></div>`;
  }

  window.openSupForm = function (id) {
    const s = id ? cache.suppliers.find(x => x.id === id) : null;
    openModal(s ? '编辑供应商 #' + id : '新增供应商', `
      <div class="form-grid">
        <div class="field"><label>名称 *</label><input id="f-name" value="${esc(s ? s.name : '')}" placeholder="如：广州XX汽配"></div>
        <div class="field"><label>联系人</label><input id="f-contact" value="${esc(s ? s.contact : '')}"></div>
        <div class="field"><label>电话 / 微信</label><input id="f-phone" value="${esc(s ? s.phone : '')}"></div>
        <div class="field"><label>备注</label><input id="f-remark" value="${esc(s ? s.remark : '')}"></div>
      </div>`,
      `<button class="btn btn-light" onclick="closeModal()">取消</button>
       <button class="btn btn-primary" onclick="saveSup(${id || 0})">保存</button>`);
  };

  window.saveSup = async function (id) {
    const body = { name: $('#f-name').value.trim(), contact: $('#f-contact').value.trim(), phone: $('#f-phone').value.trim(), remark: $('#f-remark').value.trim() };
    if (!body.name) { toast('名称必填', true); return; }
    try {
      if (id) { await api('/api/suppliers/' + id, 'PUT', body); toast('已保存'); }
      else { await api('/api/suppliers', 'POST', body); toast('已新增'); }
      closeModal(); await loadBase(); renderSuppliers();
    } catch (e) { toast(e.message, true); }
  };

  window.delSup = async function (id) {
    if (!confirm('确认删除该供应商？')) return;
    try { await api('/api/suppliers/' + id, 'DELETE'); toast('已删除'); await loadBase(); renderSuppliers(); }
    catch (e) { toast(e.message, true); }
  };

  // ---------- 客户 ----------
  async function renderCustomers() {
    let list;
    try { list = await api('/api/customers'); cache.customers = list; }
    catch (e) { toast(e.message, true); return; }
    const rows = list.map(c => `
      <tr><td>${c.id}</td><td><b>${esc(c.name)}</b></td><td>${esc(c.contact)}</td><td>${esc(c.phone)}</td><td>${esc(c.remark)}</td>
        <td><button class="btn btn-light btn-sm" onclick="openCusForm(${c.id})">编辑</button>
        <button class="btn btn-danger btn-sm" onclick="delCus(${c.id})">删除</button></td></tr>`).join('');
    $('#page-customers').innerHTML = `
      <div class="page-head"><div class="page-title">客户</div>
        <div><button class="btn btn-primary" onclick="openCusForm()">+ 新增客户</button></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>ID</th><th>名称</th><th>联系人</th><th>电话</th><th>备注</th><th>操作</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="empty">暂无客户</td></tr>'}</tbody>
      </table></div>`;
  }

  window.openCusForm = function (id) {
    const c = id ? cache.customers.find(x => x.id === id) : null;
    openModal(c ? '编辑客户 #' + id : '新增客户', `
      <div class="form-grid">
        <div class="field"><label>名称 *</label><input id="f-name" value="${esc(c ? c.name : '')}" placeholder="如：XX修理厂"></div>
        <div class="field"><label>联系人</label><input id="f-contact" value="${esc(c ? c.contact : '')}"></div>
        <div class="field"><label>电话 / 微信</label><input id="f-phone" value="${esc(c ? c.phone : '')}"></div>
        <div class="field"><label>备注</label><input id="f-remark" value="${esc(c ? c.remark : '')}"></div>
      </div>`,
      `<button class="btn btn-light" onclick="closeModal()">取消</button>
       <button class="btn btn-primary" onclick="saveCus(${id || 0})">保存</button>`);
  };

  window.saveCus = async function (id) {
    const body = { name: $('#f-name').value.trim(), contact: $('#f-contact').value.trim(), phone: $('#f-phone').value.trim(), remark: $('#f-remark').value.trim() };
    if (!body.name) { toast('名称必填', true); return; }
    try {
      if (id) { await api('/api/customers/' + id, 'PUT', body); toast('已保存'); }
      else { await api('/api/customers', 'POST', body); toast('已新增'); }
      closeModal(); await loadBase(); renderCustomers();
    } catch (e) { toast(e.message, true); }
  };

  window.delCus = async function (id) {
    if (!confirm('确认删除该客户？')) return;
    try { await api('/api/customers/' + id, 'DELETE'); toast('已删除'); await loadBase(); renderCustomers(); }
    catch (e) { toast(e.message, true); }
  };

  // ---------- 询价与比价 ----------
  async function renderInquiries() {
    let list;
    try { list = await api('/api/inquiries'); }
    catch (e) { toast(e.message, true); return; }
    const cards = list.map(q => {
      const qrows = (q.quotes || []).map(qt => `
        <tr class="${q.chosen_quote_id == qt.id ? 'chosen' : ''}">
          <td>${esc(qt.supplier_name || '-')}</td>
          <td class="money">${fmt(qt.price)}</td>
          <td>${qt.delivery_days != null ? qt.delivery_days + ' 天' : '-'}</td>
          <td>${esc(qt.remark)}</td>
          <td>${q.chosen_quote_id == qt.id ? '<span class="chosen-mark">✓ 已选中</span>'
            : (q.status === 'open' ? '<button class="btn btn-success btn-sm" onclick="chooseQuote(' + q.id + ',' + qt.id + ')">设为中标</button>' : '')}</td>
        </tr>`).join('');
      return `
        <div class="inq-card">
          <div class="inq-head">
            <div class="inq-title">${esc(q.part_name)}${q.oe_code ? ' · ' + esc(q.oe_code) : ''} ${q.vehicle ? '<span class="muted">(' + esc(q.vehicle) + ')</span>' : ''}</div>
            <div>
              <span class="tag ${q.status === 'open' ? 'tag-open' : 'tag-closed'}">${q.status === 'open' ? '询价中' : '已关闭'}</span>
              <span class="muted" style="margin-left:8px;">${dt(q.created_at)}</span>
            </div>
          </div>
          <div class="muted" style="margin-top:4px;">数量 ${q.quantity}${q.remark ? ' · 备注：' + esc(q.remark) : ''}</div>
          <table class="quote-table">
            <thead><tr><th>供应商</th><th>报价</th><th>交期</th><th>备注</th><th>选择</th></tr></thead>
            <tbody>${qrows || '<tr><td colspan="5" class="muted">暂无报价</td></tr>'}</tbody>
          </table>
          <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
            ${q.status === 'open' ? '<button class="btn btn-light btn-sm" onclick="closeInquiry(' + q.id + ')">关闭询价</button>' : ''}
            <button class="btn btn-danger btn-sm" onclick="delInquiry(' + q.id + ')">删除</button>
          </div>
        </div>`;
    }).join('');
    $('#page-inquiries').innerHTML = `
      <div class="page-head"><div class="page-title">询价与比价</div>
        <div><button class="btn btn-primary" onclick="openInquiryForm()">+ 新建询价</button></div></div>
      <div class="muted" style="margin-bottom:12px;">登记询价需求 + 多家供应商报价，系统自动推荐最低价；可人工指定中标后转入采购。</div>
      ${cards || '<div class="card empty">暂无询价记录</div>'}`;
  }

  window.openInquiryForm = function () {
    const supOpts = cache.suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    openModal('新建询价', `
      <div class="form-grid">
        <div class="field"><label>配件名称 *</label><input id="q-name" placeholder="如：前刹车片"></div>
        <div class="field"><label>OE 码</label><input id="q-oe"></div>
        <div class="field"><label>适用车型</label><input id="q-vehicle"></div>
        <div class="field"><label>数量</label><input id="q-qty" type="number" min="1" value="1"></div>
        <div class="field" style="grid-column:1/-1;"><label>备注</label><input id="q-remark" placeholder="如：要原厂件 / 加急"></div>
      </div>
      <div style="font-size:13px;font-weight:600;margin-top:14px;">供应商报价 <span class="muted">（至少填一行）</span></div>
      <div id="quote-rows" class="row-list"></div>
      <button class="btn btn-light btn-sm row-add" onclick="addQuoteRow()">+ 添加报价行</button>`,
      `<button class="btn btn-light" onclick="closeModal()">取消</button>
       <button class="btn btn-primary" onclick="saveInquiry()">提交询价</button>`);
    addQuoteRow(supOpts);
  };

  window.addQuoteRow = function (supOpts) {
    const opts = supOpts || cache.suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    const row = document.createElement('div');
    row.className = 'row-item';
    row.innerHTML = `
      <select class="q-supplier"><option value="">（选择供应商）</option>${opts}</select>
      <input class="q-price" type="number" step="0.01" min="0" placeholder="报价(元)">
      <input class="q-days" type="number" min="0" placeholder="交期(天)">
      <input class="q-remark" placeholder="备注" style="flex:1;min-width:100px;">
      <button class="rm" onclick="this.parentNode.remove()">×</button>`;
    $('#quote-rows').appendChild(row);
  };

  window.saveInquiry = async function () {
    const quotes = $$('#quote-rows .row-item').map(r => ({
      supplier_id: $('.q-supplier', r).value || null,
      price: $('.q-price', r).value || 0,
      delivery_days: $('.q-days', r).value || null,
      remark: $('.q-remark', r).value.trim()
    })).filter(q => q.supplier_id || Number(q.price) > 0);
    const body = {
      part_name: $('#q-name').value.trim(), oe_code: $('#q-oe').value.trim(), vehicle: $('#q-vehicle').value.trim(),
      quantity: $('#q-qty').value || 1, remark: $('#q-remark').value.trim(), quotes
    };
    if (!body.part_name) { toast('配件名称必填', true); return; }
    if (!quotes.length) { toast('至少填写一家供应商报价', true); return; }
    try { await api('/api/inquiries', 'POST', body); toast('询价已提交'); closeModal(); renderInquiries(); }
    catch (e) { toast(e.message, true); }
  };

  window.chooseQuote = async function (inqId, quoteId) {
    try { await api('/api/inquiries/' + inqId + '/choose', 'POST', { quote_id: quoteId }); toast('已设为中标'); renderInquiries(); }
    catch (e) { toast(e.message, true); }
  };

  window.closeInquiry = async function (id) {
    try { await api('/api/inquiries/' + id + '/close', 'POST'); toast('已关闭'); renderInquiries(); }
    catch (e) { toast(e.message, true); }
  };

  window.delInquiry = async function (id) {
    if (!confirm('确认删除该询价单？')) return;
    try { await api('/api/inquiries/' + id, 'DELETE'); toast('已删除'); renderInquiries(); }
    catch (e) { toast(e.message, true); }
  };

  // ---------- 采购 ----------
  async function renderPurchases() {
    let list;
    try { list = await api('/api/purchases'); }
    catch (e) { toast(e.message, true); return; }
    const rows = list.map(p => {
      const itemsHtml = (p.items || []).map(it => `<div class="muted" style="font-size:12.5px;">${esc(it.part_name)} × ${it.qty} @ ${fmt(it.price)}</div>`).join('');
      const tag = { draft: 'tag-draft', confirmed: 'tag-confirmed', received: 'tag-received' }[p.status] || 'tag-draft';
      const label = { draft: '草稿', confirmed: '已确认', received: '已收货' }[p.status] || p.status;
      return `
        <tr>
          <td>#${p.id}</td><td><b>${esc(p.supplier_name || '-')}</b></td>
          <td><span class="tag ${tag}">${label}</span></td>
          <td class="money">${fmt(p.total)}</td>
          <td>${esc(p.remark)}</td><td>${dt(p.created_at)}</td>
          <td>
            ${p.status === 'draft' ? '<button class="btn btn-warn btn-sm" onclick="confirmPurchase(' + p.id + ')">确认</button> ' : ''}
            ${p.status === 'confirmed' ? '<button class="btn btn-success btn-sm" onclick="receivePurchase(' + p.id + ')">收货入库</button> ' : ''}
            ${p.status === 'draft' ? '<button class="btn btn-danger btn-sm" onclick="delPurchase(' + p.id + ')">删除</button>' : ''}
            <button class="btn btn-light btn-sm" onclick="viewItems(this)">明细</button>
          </td>
        </tr>
        <tr style="display:none" class="purchase-items"><td colspan="7">${itemsHtml}</td></tr>`;
    }).join('');
    $('#page-purchases').innerHTML = `
      <div class="page-head"><div class="page-title">采购入库</div>
        <div><button class="btn btn-primary" onclick="openPurchaseForm()">+ 新建采购单</button></div></div>
      <div class="muted" style="margin-bottom:12px;">流程：草稿 → 确认下单 → 收货入库（自动加库存）。</div>
      <div class="table-wrap"><table>
        <thead><tr><th>单号</th><th>供应商</th><th>状态</th><th>金额</th><th>备注</th><th>创建时间</th><th>操作</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7" class="empty">暂无采购单</td></tr>'}</tbody>
      </table></div>`;
  }

  window.viewItems = function (btn) {
    const row = btn.closest('tr').nextElementSibling;
    row.style.display = row.style.display === 'none' ? '' : 'none';
  };

  window.openPurchaseForm = function () {
    const supOpts = cache.suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    openModal('新建采购单', `
      <div class="form-grid">
        <div class="field"><label>供应商 *</label><select id="p-supplier"><option value="">（选择供应商）</option>${supOpts}</select></div>
        <div class="field"><label>备注</label><input id="p-remark"></div>
      </div>
      <div style="font-size:13px;font-weight:600;margin-top:14px;">采购明细</div>
      <div id="purchase-rows" class="row-list"></div>
      <button class="btn btn-light btn-sm row-add" onclick="addPurchaseRow()">+ 添加配件</button>`,
      `<button class="btn btn-light" onclick="closeModal()">取消</button>
       <button class="btn btn-primary" onclick="savePurchase()">保存草稿</button>`);
    addPurchaseRow();
  };

  window.addPurchaseRow = function () {
    const opts = cache.parts.map(pt => `<option value="${pt.id}" data-cost="${pt.cost_price}">#${pt.id} ${esc(pt.name)}</option>`).join('');
    const row = document.createElement('div');
    row.className = 'row-item';
    row.innerHTML = `
      <select class="p-part" onchange="this.parentNode.querySelector('.p-price').value = this.selectedOptions[0].dataset.cost"><option value="">（选择配件）</option>${opts}</select>
      <input class="p-qty" type="number" min="1" value="1" placeholder="数量">
      <input class="p-price" type="number" step="0.01" min="0" placeholder="单价(元)">
      <button class="rm" onclick="this.parentNode.remove()">×</button>`;
    $('#purchase-rows').appendChild(row);
  };

  window.savePurchase = async function () {
    const supplier_id = $('#p-supplier').value || null;
    const items = $$('#purchase-rows .row-item').map(r => {
      const sel = $('.p-part', r);
      return { part_id: sel.value || null, part_name: sel.selectedOptions[0] ? sel.selectedOptions[0].textContent.replace(/^#\d+\s*/, '') : '', qty: $('.p-qty', r).value || 1, price: $('.p-price', r).value || 0 };
    }).filter(it => it.part_id);
    if (!supplier_id) { toast('请选择供应商', true); return; }
    if (!items.length) { toast('至少添加一项配件', true); return; }
    try { await api('/api/purchases', 'POST', { supplier_id, remark: $('#p-remark').value.trim(), items }); toast('采购单已创建（草稿）'); closeModal(); renderPurchases(); }
    catch (e) { toast(e.message, true); }
  };

  window.confirmPurchase = async function (id) {
    if (!confirm('确认该采购单下单？')) return;
    try { await api('/api/purchases/' + id + '/confirm', 'POST'); toast('已确认下单'); renderPurchases(); }
    catch (e) { toast(e.message, true); }
  };

  window.receivePurchase = async function (id) {
    if (!confirm('确认收货？库存将自动增加。')) return;
    try { await api('/api/purchases/' + id + '/receive', 'POST'); toast('已收货入库'); await loadBase(); renderPurchases(); }
    catch (e) { toast(e.message, true); }
  };

  window.delPurchase = async function (id) {
    if (!confirm('确认删除该草稿采购单？')) return;
    try { await api('/api/purchases/' + id, 'DELETE'); toast('已删除'); renderPurchases(); }
    catch (e) { toast(e.message, true); }
  };

  // ---------- 销售 ----------
  async function renderSales() {
    let list;
    try { list = await api('/api/sales'); }
    catch (e) { toast(e.message, true); return; }
    const rows = list.map(s => {
      const itemsHtml = (s.items || []).map(it => `<div class="muted" style="font-size:12.5px;">${esc(it.part_name)} × ${it.qty} @ ${fmt(it.price)} <span class="tag" style="background:#f0fdf4;color:#15803d;">毛利 ${fmt(it.profit)}</span></div>`).join('');
      return `
        <tr>
          <td>#${s.id}</td><td><b>${esc(s.customer_name || '-')}</b></td>
          <td class="money">${fmt(s.total)}</td>
          <td>${esc(s.remark)}</td><td>${dt(s.created_at)}</td>
          <td>
            <button class="btn btn-light btn-sm" onclick="viewItems(this)">明细</button>
            <button class="btn btn-danger btn-sm" onclick="delSale(${s.id})">删除</button>
          </td>
        </tr>
        <tr style="display:none" class="purchase-items"><td colspan="6">${itemsHtml}</td></tr>`;
    }).join('');
    $('#page-sales').innerHTML = `
      <div class="page-head"><div class="page-title">销售出库</div>
        <div><button class="btn btn-success" onclick="openSaleForm()">+ 新建销售单</button></div></div>
      <div class="muted" style="margin-bottom:12px;">销售出库自动扣减库存并计算毛利。</div>
      <div class="table-wrap"><table>
        <thead><tr><th>单号</th><th>客户</th><th>金额</th><th>备注</th><th>创建时间</th><th>操作</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="empty">暂无销售单</td></tr>'}</tbody>
      </table></div>`;
  }

  window.openSaleForm = function () {
    const cusOpts = cache.customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    openModal('新建销售单', `
      <div class="form-grid">
        <div class="field"><label>客户 *</label><select id="s-customer"><option value="">（选择客户）</option>${cusOpts}</select></div>
        <div class="field"><label>备注</label><input id="s-remark" placeholder="如：微信客户 / 自提"></div>
      </div>
      <div style="font-size:13px;font-weight:600;margin-top:14px;">销售明细 <span class="muted">（库存不足将无法提交）</span></div>
      <div id="sale-rows" class="row-list"></div>
      <button class="btn btn-light btn-sm row-add" onclick="addSaleRow()">+ 添加配件</button>`,
      `<button class="btn btn-light" onclick="closeModal()">取消</button>
       <button class="btn btn-success" onclick="saveSale()">确认出库</button>`);
    addSaleRow();
  };

  window.addSaleRow = function () {
    const opts = cache.parts.map(pt => `<option value="${pt.id}" data-sell="${pt.sell_price}" data-stock="${pt.stock}">#${pt.id} ${esc(pt.name)}（库存${pt.stock}）</option>`).join('');
    const row = document.createElement('div');
    row.className = 'row-item';
    row.innerHTML = `
      <select class="s-part" onchange="this.parentNode.querySelector('.s-price').value = this.selectedOptions[0].dataset.sell"><option value="">（选择配件）</option>${opts}</select>
      <input class="s-qty" type="number" min="1" value="1" placeholder="数量">
      <input class="s-price" type="number" step="0.01" min="0" placeholder="售价(元)">
      <button class="rm" onclick="this.parentNode.remove()">×</button>`;
    $('#sale-rows').appendChild(row);
  };

  window.saveSale = async function () {
    const customer_id = $('#s-customer').value || null;
    const items = $$('#sale-rows .row-item').map(r => {
      const sel = $('.s-part', r);
      return { part_id: sel.value || null, part_name: sel.selectedOptions[0] ? sel.selectedOptions[0].textContent.replace(/^#\d+\s*/, '').replace(/（库存\d+）\s*$/, '') : '', qty: $('.s-qty', r).value || 1, price: $('.s-price', r).value || 0 };
    }).filter(it => it.part_id);
    if (!customer_id) { toast('请选择客户', true); return; }
    if (!items.length) { toast('至少添加一项配件', true); return; }
    try { await api('/api/sales', 'POST', { customer_id, remark: $('#s-remark').value.trim(), items }); toast('销售单已出库'); closeModal(); await loadBase(); renderSales(); }
    catch (e) { toast(e.message, true); }
  };

  window.delSale = async function (id) {
    if (!confirm('确认删除该销售单？库存将回滚。')) return;
    try { await api('/api/sales/' + id, 'DELETE'); toast('已删除，库存已回滚'); await loadBase(); renderSales(); }
    catch (e) { toast(e.message, true); }
  };

  // ---------- 库存预警 ----------
  async function renderInventory() {
    let list;
    try { list = await api('/api/inventory/low'); }
    catch (e) { toast(e.message, true); return; }
    const rows = list.map(p => `
      <tr>
        <td>${p.id}</td><td><b>${esc(p.name)}</b></td><td>${esc(p.oe_code)}</td><td>${esc(p.vehicle)}</td>
        <td class="money">${p.stock}</td><td class="money">${p.min_stock}</td>
        <td><span class="tag tag-low">缺货预警</span></td>
        <td>${esc(p.supplier_name || '-')}</td>
        <td><button class="btn btn-light btn-sm" onclick="openPartForm(${p.id})">补货/编辑</button></td>
      </tr>`).join('');
    $('#page-inventory').innerHTML = `
      <div class="page-head"><div class="page-title">库存预警</div>
        <div><button class="btn btn-primary" onclick="switchPage('purchases')">去采购补货</button></div></div>
      <div class="muted" style="margin-bottom:12px;">以下配件库存 ≤ 预警线，建议尽快补货。</div>
      <div class="table-wrap"><table>
        <thead><tr><th>ID</th><th>名称</th><th>OE码</th><th>车型</th><th>当前库存</th><th>预警线</th><th>状态</th><th>常用供应商</th><th>操作</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="9" class="empty">库存充足，暂无预警</td></tr>'}</tbody>
      </table></div>`;
  }

  // ---------- 事件绑定 ----------
  function bind() {
    $('#login-btn').addEventListener('click', login);
    $('#login-password').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
    $('#logout-btn').addEventListener('click', logout);
    $$('.nav-btn').forEach(b => b.addEventListener('click', () => switchPage(b.dataset.page)));
  }

  // 全局暴露（供内联 onclick 使用）
  window.switchPage = switchPage;
  window.viewItems = viewItems;

  // ---------- 启动 ----------
  document.addEventListener('DOMContentLoaded', () => {
    bind();
    if (token) {
      enterApp().catch(() => {});
    } else {
      $('#login-view').style.display = 'flex';
    }
  });
})();
