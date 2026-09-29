// popup.js —— 统一多平台弹窗：三步式（平台/周期/功能）
const HINT = '（可先关闭，完成后再回来下载）';
const RUNNING_STALE_MS = 30 * 60 * 1000; // 提取中超过 30 分钟视为陈旧（防死锁），自动重置
// 平台 → 官方登录/数据中心地址（未登录/未打开平台页时，按所选平台提示）
const LOGIN_URL = {
  '视频号': 'https://channels.weixin.qq.com',
  '抖音': 'https://creator.douyin.com',
  '小红书': 'https://creator.xiaohongshu.com',
  '哔哩哔哩': 'https://member.bilibili.com/platform/home',
};
let latest = null;
let successHandled = false; // 本次弹窗会话是否已成功处理过提取结果，避免 extractDone 覆盖「完成 ✓」
function restore() {
  chrome.storage.local.get(['running', 'runningAt', 'lastResult']).then((v) => {
    if (v && v.running) {
      const stale = !v.runningAt || (Date.now() - v.runningAt) > RUNNING_STALE_MS;
      if (stale) { // 陈旧（提取页已关/内容脚本崩）：直接重置，避免永久「提取中」
        chrome.storage.local.set({ running: false }).catch(() => {});
        setExtractBtn(true); clearCooldown(); setBtns(false); $('result').textContent = ''; setStatus('');
        return;
      }
      setStatus('提取中…' + HINT); setBtns(false); setExtractBtn(false); return;
    }
    if (v && v.lastResult) { latest = v.lastResult; syncSelectsToLatest(); applySelectionState(); }
    else { setExtractBtn(true); clearCooldown(); setBtns(false); $('result').textContent = ''; setStatus(''); }
  }).catch(() => {});
}
// 接收内容脚本的完成通知（结果已写入 storage，这里恢复界面）
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'extractDone' && !successHandled) { restore(); } // 结果已存入 storage，恢复并启用按钮（已处理则不再覆盖）
});
restore(); // 打开弹窗时恢复上次成功结果，避免下载按钮一直灰色
function activeTab() { return new Promise((r) => chrome.tabs.query({ active: true, currentWindow: true }, (t) => r(t[0]))); }
// 判断某 URL 是否属于所选平台
function urlMatches(url, platform) {
  const hosts = platform === '视频号' ? ['channels.weixin.qq.com'] : platform === '抖音' ? ['creator.douyin.com'] : [];
  try { const h = new URL(url).hostname; return hosts.some((d) => h === d || h.endsWith('.' + d)); } catch (e) { return false; }
}
function sendToTab(tabId, msg) { return new Promise((res, rej) => { chrome.tabs.sendMessage(tabId, msg, (r) => { if (chrome.runtime.lastError) rej(new Error(chrome.runtime.lastError.message)); else res(r); }); }); }
// 等待标签页加载完成
function waitTabComplete(tabId, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(to); chrome.tabs.onUpdated.removeListener(l); resolve(); };
    const to = setTimeout(finish, timeoutMs || 15000);
    function l(id, info) { if (id === tabId && info.status === 'complete') finish(); }
    chrome.tabs.onUpdated.addListener(l);
    chrome.tabs.get(tabId, (t) => { if (chrome.runtime.lastError) return finish(); if (t && t.status === 'complete') finish(); });
  });
}
// 发送失败（内容脚本缺失，如扩展重载前的旧标签页）→ 刷新重载该页使内容脚本注入 → 重发一次
async function sendToTabRetry(tabId, msg) {
  try { return await sendToTab(tabId, msg); }
  catch (e) {
    await new Promise((r2) => chrome.tabs.reload(tabId, () => r2()));
    await waitTabComplete(tabId, 20000);
    return await sendToTab(tabId, msg);
  }
}
function $(id) { return document.getElementById(id); }
$('platform').addEventListener('change', () => { applySelectionState(); });
$('period').addEventListener('change', () => { applySelectionState(); });
function setStatus(s, isErr) { const el = $('status'); el.textContent = s; el.className = isErr ? 'err' : ''; }
function setBtns(enable) { $('csv').disabled = !enable; $('postCsv').disabled = !enable; $('zipCover').disabled = !enable; }
function setExtractBtn(enable) { $('extract').disabled = !enable; }
// 把平台/周期下拉框同步成当前数据（latest）对应的值，便于辨认该数据属于哪个平台/周期。
function syncSelectsToLatest() {
  if (!latest) return;
  if ($('platform') && ['视频号', '抖音'].includes(latest.platform)) $('platform').value = latest.platform;
  if ($('period')) $('period').value = latest.scopeLabel === '周度' ? 'week' : 'month';
}
// 结果摘要与提示都跟随「当前所选平台+周期」：与已加载数据一致则显示并启用下载，不一致则清空（避免切换后仍显示旧平台/周期的数据与提示）。
function applySelectionState() {
  if (!latest) { setBtns(false); $('result').textContent = ''; setStatus(''); refreshBtnState(); return; }
  const plat = $('platform').value, period = $('period').value;
  const latestPeriod = latest.scopeLabel === '周度' ? 'week' : 'month';
  const match = plat === latest.platform && period === latestPeriod;
  if (match) { render(latest); setBtns(true); refreshBtnState('已加载上次结果，可直接点击上方「下载」'); }
  else { setBtns(false); $('result').textContent = ''; setStatus(''); refreshBtnState(); } // 重置后仍更新当前平台「提取数据」冷却状态
}
function render(d) {
  let t = '平台: ' + d.platform + ' · 周期: ' + d.period + ' （' + (d.rangeText || d.scopeLabel) + '）\n';
  t += '单篇作品: ' + d.count + ' 条；可下载汇总/单篇CSV、封面ZIP\n';
  if (d.warning) t += '⚠ ' + d.warning + '\n';
  $('result').textContent = t;
}
function download(name, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  chrome.downloads.download({ url, filename: name, saveAs: true }, () => URL.revokeObjectURL(url));
}

function crc32(buf) { let t = crc32.t || (crc32.t = (() => { const a = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); a[n] = c >>> 0; } return a; })()); let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function buildZip(files) { const enc = new TextEncoder(); const parts = [], central = []; let offset = 0;
  for (const f of files) { const name = enc.encode(f.name), data = f.data, crc = crc32(data); const local = new Uint8Array(30 + name.length), dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034B50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true); dv.setUint16(8, 0, true); dv.setUint16(10, 0, true); dv.setUint16(12, 0x21, true);
    dv.setUint32(14, crc, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true); dv.setUint16(26, name.length, true); dv.setUint16(28, 0, true);
    local.set(name, 30); parts.push(local, data);
    const c = new Uint8Array(46 + name.length), c2 = new DataView(c.buffer);
    c2.setUint32(0, 0x02014B50, true); c2.setUint16(4, 20, true); c2.setUint16(6, 20, true); c2.setUint16(8, 0x0800, true); c2.setUint16(10, 0, true); c2.setUint16(12, 0, true); c2.setUint16(14, 0x21, true);
    c2.setUint32(16, crc, true); c2.setUint32(20, data.length, true); c2.setUint32(24, data.length, true); c2.setUint16(28, name.length, true); c2.setUint16(30, 0, true); c2.setUint16(32, 0, true);
    c2.setUint16(34, 0, true); c2.setUint16(36, 0, true); c2.setUint32(38, 0, true); c2.setUint32(42, offset, true); c.set(name, 46); central.push(c); offset += local.length + data.length; }
  const cs = central.reduce((a, x) => a + x.length, 0); const e = new Uint8Array(22), ed = new DataView(e.buffer);
  ed.setUint32(0, 0x06054B50, true); ed.setUint16(4, 0, true); ed.setUint16(6, 0, true); ed.setUint16(8, files.length, true); ed.setUint16(10, files.length, true); ed.setUint32(12, cs, true); ed.setUint32(16, offset, true); ed.setUint16(20, 0, true);
  return new Blob([...parts, ...central, e], { type: 'application/zip' }); }

const COOLDOWN_S = 60;
let cdTimer = null;
function clearCooldown() { if (cdTimer) { clearInterval(cdTimer); cdTimer = null; } const b = $('extract'); if (b) b.textContent = '提取数据'; }
function startCooldown(seconds, doneMsg) {
  setExtractBtn(false); clearCooldown();
  let left = Math.max(0, Math.floor(seconds));
  const btn = $('extract'), base = '提取数据';
  if (btn) btn.textContent = left + '秒重新提取';
  if (doneMsg) setStatus(doneMsg);
  cdTimer = setInterval(() => {
    left--;
    if (left <= 0) { clearInterval(cdTimer); cdTimer = null; setExtractBtn(true); if (btn) btn.textContent = base; }
    else if (btn) btn.textContent = left + '秒重新提取';
  }, 1000);
}
// 按当前所选平台单独判断是否在 60 秒冷却内；冷却按平台独立计算。
function refreshBtnState(doneMsg) {
  const platform = $('platform').value;
  chrome.storage.local.get(['lastResultAtMap']).then((v) => {
    const map = (v && v.lastResultAtMap) || {};
    const at = map[platform] || 0;
    const remain = COOLDOWN_S - Math.floor((Date.now() - at) / 1000);
    if (remain > 0) startCooldown(remain, doneMsg);
    else { setExtractBtn(true); clearCooldown(); if (doneMsg) setStatus(doneMsg); }
  }).catch(() => { setExtractBtn(true); clearCooldown(); });
}
async function doExtract() {
  setStatus('提取中…' + HINT); $('result').textContent = ''; setBtns(false); setExtractBtn(false); clearCooldown(); successHandled = false;
  try {
    const platform = $('platform').value, period = $('period').value;
    const tab = await activeTab();
    if (!tab || !tab.url || !urlMatches(tab.url, platform)) { setBtns(false); setExtractBtn(true); clearCooldown(); setStatus('请先打开并登录「' + platform + '」：' + (LOGIN_URL[platform] || '')); return; }
    const r = await sendToTabRetry(tab.id, { type: 'extract', platform, period, concurrency: 4 });
    if (!r || !r.ok) throw new Error((r && r.error) || '无响应');
    latest = r.data; render(latest); syncSelectsToLatest(); setBtns(true); startCooldown(COOLDOWN_S, '完成 ✓ 可点击上方「下载」保存'); successHandled = true;
  } catch (e) { setBtns(false); setExtractBtn(true); clearCooldown(); setStatus('提取失败！' + e.message, true); }
}
$('extract').addEventListener('click', doExtract);
// 注意：不因切换平台/周期而清空 60 秒冷却，避免绕过风控；冷却由 startCooldown 统一管理。
$('csv').addEventListener('click', () => { if (!latest) { setStatus('请先「提取数据」', true); return; } download(latest.platform + '_' + latest.periodName + '_' + latest.scopeLabel + '汇总数据统计.csv', '\uFEFF' + latest.summaryCsv, 'text/csv'); setStatus('已发起下载汇总CSV'); });
$('postCsv').addEventListener('click', () => { if (!latest || !latest.posts || !latest.posts.length) { setStatus('请先「提取数据」或本期无作品', true); return; } download(latest.platform + '_' + latest.periodName + '_' + latest.scopeLabel + '作品数据统计.csv', '\uFEFF' + latest.postCsv, 'text/csv'); setStatus('已发起下载单篇CSV'); });
$('zipCover').addEventListener('click', async () => { if (!latest || !latest.posts || !latest.posts.length) { setStatus('请先「提取数据」或无封面', true); return; } setStatus('正在打包封面…'); try { const files = []; let total = 0, ok = 0; const fails = []; for (const p of latest.posts) { if (!p.coverUrl || !p.coverFileName) continue; total++; const nm = p.coverFileName; try { const r = await fetch(p.coverUrl); if (r.ok) { files.push({ name: nm, data: new Uint8Array(await r.arrayBuffer()) }); ok++; } else { fails.push(nm + '(HTTP ' + r.status + ')'); } } catch (e) { fails.push(nm + '(网络/' + ((e && e.message) || '取图失败') + ')'); } } if (!files.length) { setStatus('没有可打包封面（共尝试 ' + total + ' 张' + (fails.length ? '，失败 ' + fails.length + ' 张，如：' + fails.slice(0, 3).join('、') : '') + '）', true); return; } const blob = buildZip(files); const url = URL.createObjectURL(blob); chrome.downloads.download({ url, filename: latest.platform + '_' + latest.coverFolder + '.zip', saveAs: true }, () => URL.revokeObjectURL(url)); setStatus('已打包 ' + files.length + ' 张封面' + (ok < total ? '（' + (total - ok) + ' 张失败：' + fails.slice(0, 3).join('、') + (fails.length > 3 ? ' 等' : '') + '，可能因图片链接过期）' : '')); } catch (e) { setStatus('失败: ' + e.message, true); } });
