// content.js —— 统一多平台创作者数据中心提取
// 运行在已登录的：抖音创作者中心(creator.douyin.com) / 微信视频号助手(channels.weixin.qq.com)
const pad2 = (n) => String(n).padStart(2, '0');
// YYYYMMDD -> YYYY.MM.DD（用于周度显示具体日期范围）
function fmtRange(yyyymmdd) { const s = String(yyyymmdd); return s.slice(0, 4) + '.' + s.slice(4, 6) + '.' + s.slice(6, 8); }

function monthInfo() { const n = new Date(); const y = n.getFullYear(), m = n.getMonth(); const py = m === 0 ? y - 1 : y, pm = m === 0 ? 11 : m - 1; const ymd = (d) => '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()); return { label: py + '年' + pad2(pm + 1) + '月', startTs: Math.floor(new Date(py, pm, 1).getTime() / 1000), endTs: Math.floor(new Date(py, pm + 1, 0).getTime() / 1000), startD: ymd(new Date(py, pm, 1)), endD: ymd(new Date(py, pm + 1, 0)) }; }
function isoWeek(d) { const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const day = (dt.getDay() + 6) % 7; dt.setDate(dt.getDate() - day + 3); const y = dt.getFullYear(); const jan4 = new Date(y, 0, 4); const j4 = (jan4.getDay() + 6) % 7; const w1 = new Date(jan4.getTime() - j4 * 86400000); return { year: y, week: 1 + Math.round((dt - w1) / (7 * 86400000)) }; }
function weekInfo() { const n = new Date(); const dow = n.getDay(); const diff = dow === 0 ? 6 : dow - 1; const curMon = new Date(n.getFullYear(), n.getMonth(), n.getDate() - diff); const prevMon = new Date(curMon.getTime() - 7 * 86400000); const prevSun = new Date(prevMon.getTime() + 6 * 86400000); const iw = isoWeek(prevMon); const ymd = (d) => '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()); return { startTs: Math.floor(new Date(prevMon.getFullYear(), prevMon.getMonth(), prevMon.getDate()).getTime() / 1000), endTs: Math.floor(new Date(prevSun.getFullYear(), prevSun.getMonth(), prevSun.getDate()).getTime() / 1000), startD: ymd(prevMon), endD: ymd(prevSun), label: iw.year + '年' + iw.week + '周' }; }
function cDate(sec) { const d = new Date(sec * 1000); return '' + d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function cDateTimeS(sec) { const d = new Date(sec * 1000); return '' + d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()); }
function cDateYmd(sec) { const d = new Date(sec * 1000); return '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()); }
function sum(a) { return a.reduce((x, y) => x + (parseInt(y, 10) || 0), 0); }
function last(a) { return a[a.length - 1]; }
function pct(x) { return (x * 100).toFixed(2) + '%'; }
// 毫秒 -> H:MM:SS（作品时长，来自 work_list.duration）；向上取整
function fmtDurMs(ms) { const s = Math.ceil((Number(ms) || 0) / 1000); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return h + ':' + pad2(m) + ':' + pad2(sec); }
function esc(v) { v = String(v == null ? '' : v); if (/^[=+@]/.test(v)) v = "'" + v; return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function toCsv(rows) { return rows.map((r) => r.map(esc).join(',')).join('\n') + '\n'; }

// ================= 微信视频号 =================
async function axhr(url, opt) {
  // 网络错误重试；HTTP 错误（401/403/500）不再重试并给出明确提示；JSON 解析失败才重试。
  let last;
  for (let k = 0; k < 3; k++) {
    let r;
    try { r = await fetch(url, Object.assign({ credentials: 'include' }, opt)); }
    catch (e) { last = e; await new Promise((res) => setTimeout(res, 900)); continue; }
    if (!r.ok) throw new Error('请求失败（HTTP ' + r.status + '）：请确认已登录对应平台后再操作');
    try { return await r.json(); } catch (e) { last = e; await new Promise((res) => setTimeout(res, 900)); }
  }
  throw new Error('请求失败：请确认已登录对应平台后再操作（若已登录请刷新页面重试）');
}
// 抖音接口返回 status_code!=0（如 8=用户未登录）时，视为登录失效，给出友好提示
function assertLogin(json) {
  if (json && json.status_code !== undefined && json.status_code !== 0) {
    if (json.status_code === 8) throw new Error('登录已失效，请先登录「抖音」后再操作（若已登录请刷新页面重试）');
    throw new Error('抖音数据获取失败！错误码' + json.status_code + '：' + (json.status_msg || '') );
  }
}
// 读取视频号账号ID（finder id）：直接读页面 localStorage（内容脚本与页面同源，共享同一份 localStorage）
async function readFinderId() {
  for (let k = 0; k < 4; k++) {
    try {
      let f = localStorage.getItem('finder_username') || '';
      if (!f) { for (const kk in localStorage) { const v = localStorage.getItem(kk); if (v && (v.indexOf('@finder') >= 0 || /^v2_[0-9a-f]+/i.test(v))) { f = v; break; } } }
      if (f) { f = f.endsWith('@finder') ? f : f + '@finder'; return f; }
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 700));
  }
  return '';
}
async function channelsExtract(period) {
  const scopeLabel = period === 'week' ? '周度' : '月度';
  const R = period === 'week' ? weekInfo() : monthInfo();
  let finderId = await readFinderId();
  if (finderId && !finderId.endsWith('@finder')) finderId = finderId + '@finder';
  if (!finderId) throw new Error('登录已失效，请先登录「视频号」后再操作（若已登录请刷新页面重试）');
  const body = { startTs: String(R.startTs), endTs: String(R.endTs), interval: 3, timestamp: String(Date.now()), _log_finder_uin: '', _log_finder_id: finderId, rawKeyBuff: '', pluginSessionId: null, scene: 7, reqScene: 7 };
  // 汇总/趋势接口：根路径 + 汇总页 _aid/_pageUrl
  const B = 'https://channels.weixin.qq.com/cgi-bin/mmfinderassistant-bin/statistic/';
  // 单篇作品列表接口：需走 /micro/statistic/ 路径 + 数据页 _aid/_pageUrl（此路径返回项里才带 4 个 wecom 企微统计字段）
  const MSB = 'https://channels.weixin.qq.com/micro/statistic/cgi-bin/mmfinderassistant-bin/statistic/';
  // 接口需带 _aid/_rid/_pageUrl；_aid 为视频号 Web 端常量，_rid 用页面同款「时间戳hex-随机hex」格式。
  const genRid = () => {
    try {
      const sec = Math.floor(Date.now() / 1000).toString(16);
      let rand = ''; for (let i = 0; i < 8; i++) rand += Math.floor(Math.random() * 16).toString(16);
      return sec + '-' + rand;
    } catch (e) { return Date.now().toString(16) + '-' + Math.random().toString(16).slice(2, 10); }
  };
  const vx = (path) => B + path + '?_aid=da29ffdb-3bcd-4c05-b4b7-591e3f4fb5ab&_rid=' + genRid() + '&_pageUrl=' + ('https:' + encodeURIComponent('//channels.weixin.qq.com/platform'));
  const vxMs = (path) => MSB + path + '?_aid=39c93393-93d1-4d89-93c2-5b7b85625be9&_rid=' + genRid() + '&_pageUrl=' + ('https:' + encodeURIComponent('//channels.weixin.qq.com/micro/statistic/post'));
  const post = await axhr(vx('new_post_total_data'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (post.errCode !== 0) {
    // 参考抖音：登录/会话失效类（300333/300334 等）→ 提示未登录；其它才是接口错误
    if (post.errCode === 300333 || post.errCode === 300800 || post.errCode === 300334) throw new Error('登录已失效，请先登录「视频号」后再操作（若已登录请刷新页面重试）');
    throw new Error('视频号数据获取失败！错误码' + post.errCode + '：' + (post.errMsg || '') );
  }
  const METRICS = ['browse', 'like', 'fav', 'comment', 'forward', 'follow'];
  const tabs = (post.data && post.data.dataByTabtype) || [];
  // 各渠道分解（浏览来源等）：仅用于「推荐/分享/主页/朋友/订阅号/关注/其他」这组来源分解。
  const rows = tabs.map((t) => { const d = t.data || {}; const row = { channel: t.tabTypeName || ('type' + t.tabType) }; for (const m of METRICS) row[m] = sum(d[m] || []); return row; });
  // 汇总总量：用接口自带的 totalData，它是后台显示的权威汇总值。
  // 不能对 dataByTabtype 求和——同一作品会被多个来源渠道重复曝光，like/fav 等会重复计数
  // （例如"推荐"里的 like 与"订阅号消息/朋友"里的同一条可能重叠，求和会多算）。
  const td = (post.data && post.data.totalData) || {};
  const total = {}; for (const m of METRICS) total[m] = td[m] ? sum(td[m]) : rows.reduce((a, r) => a + r[m], 0);
  const brk = Object.fromEntries(rows.filter((r) => !['PC微信', '看一看', '其他'].includes(r.channel)).map((r) => [r.channel, r.browse]));
  const other = rows.filter((r) => ['PC微信', '看一看', '其他'].includes(r.channel)).reduce((a, r) => a + r.browse, 0); brk['其他'] = other;
  let fans = null; try { const f = await axhr(vx('fans_trend'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (f.errCode === 0 && f.data) { const d = f.data; // total[] 逐日累计且已含当日净增（Δtotal[i] === netAdd[i]），last(total) 即该周期末尾收盘值；不要再加 last(netAdd)，否则把最后一天净增重复算一遍
    fans = { monthEnd: parseInt(last(d.total), 10) || 0, netAdd: sum(d.netAdd) }; } } catch (e) {}
  const summaryCsv = toCsv([['周期', '播放量', '推荐播放量', '分享播放量', '主页播放量', '朋友播放量', '订阅号消息播放量', '关注播放量', '其他播放量', '朋友量', '点赞量', '评论量', '分享量', '关注者量', '关注者总数'], [R.label, total.browse, brk['推荐'], brk['分享'], brk['主页'], brk['朋友♡'], brk['订阅号消息'], brk['关注'], brk['其他'], total.like, total.fav, total.comment, total.forward, fans ? fans.netAdd : '', fans ? fans.monthEnd : '']]);
  // 单篇作品
  let posts = [], postCsv = '', postWarn = '';
  try {
    let all = [], page = 1;
    while (true) {
      const j = await axhr(vxMs('post_list'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageSize: 100, currentPage: page, sort: 'create_time', order: 'desc', startTime: String(R.startTs), endTime: String(R.endTs), timestamp: String(Date.now()), _log_finder_uin: '', _log_finder_id: finderId, rawKeyBuff: '', pluginSessionId: null, scene: 7, reqScene: 7 }) });
      if (j.errCode !== 0) { // 与汇总接口一致：登录/会话失效（300333/300800/300334）→ 未登录提示；其它 → 接口错误
        if (j.errCode === 300333 || j.errCode === 300800 || j.errCode === 300334) throw new Error('登录已失效，请先登录「视频号」后再操作（若已登录请刷新页面重试）');
        throw new Error('视频号单篇数据获取失败！错误码' + j.errCode + '：' + (j.errMsg || '') );
      }
      const list = j.data.list || []; all.push(...list);
      if (!list.length) break;                       // 该页无数据
      if (j.data.totalCount != null && all.length >= j.data.totalCount) break; // 达到总数
      if (page >= 50) break;                          // 安全上限，防死循环
      page++; await new Promise((r) => setTimeout(r, 600));
    }
    posts = all.map((it, i) => { const m = (it.desc && it.desc.media && it.desc.media[0]) || {}; const coverUrl = m.coverUrl || m.fullCoverUrl || m.thumbUrl || ''; return { publish: cDate(it.createTime), durationSec: m.videoPlayLen != null ? m.videoPlayLen : 0, plays: it.readCount, fullRate: it.fullPlayRate != null ? pct(it.fullPlayRate) : '', avgPlay: it.avgPlayTimeSec != null ? Number(it.avgPlayTimeSec).toFixed(2) : '0', friends: it.likeCount, likes: it.favCount, comments: it.commentCount, shares: it.forwardAggregationCount, follows: it.followCount, wclick: it.wecomLinkClickCount != null ? it.wecomLinkClickCount : '', wuv: it.wecomLinkClickUv != null ? it.wecomLinkClickUv : '', wadd: it.wecomContactAddCount != null ? it.wecomContactAddCount : '', wadduv: it.wecomContactAddUv != null ? it.wecomContactAddUv : '', coverUrl, coverFileName: (coverUrl ? String(i + 1).padStart(2, '0') + '_' + it.createTime + '.jpg' : '') }; });
    postCsv = toCsv([['发布日期', '封面', '作品时长', '播放量', '完播率', '平均播放时长', '朋友量', '点赞量', '评论量', '分享量', '关注量', '企微点击次数', '企微点击人数', '添加通讯录次数', '添加通讯录人数']].concat(posts.map((p) => [p.publish, p.coverFileName, p.durationSec, p.plays, p.fullRate, p.avgPlay, p.friends, p.likes, p.comments, p.shares, p.follows, p.wclick, p.wuv, p.wadd, p.wadduv])));
  } catch (e) { postWarn = String((e && e.message) || e); }
  return { platform: '视频号', scopeLabel, periodName: R.label, period: R.label, rangeText: fmtRange(R.startD) + '-' + fmtRange(R.endD), summaryCsv, postCsv, posts, coverFolder: R.label + '_' + scopeLabel + '作品封面', count: posts.length, warning: postWarn ? '汇总数据提取成功，但单篇获取失败，请重试（' + postWarn + '）' : '' };
}

// ================= 抖音 =================
// 并发池：同时最多跑 limit 个任务，结果按原顺序返回。
async function pMap(limit, items, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); } };
  const n = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}
async function douyinExtract(period, concurrency) {
  const scopeLabel = period === 'week' ? '周度' : '月度';
  const R = period === 'week' ? weekInfo() : monthInfo();
  const B = 'https://creator.douyin.com/janus/douyin/creator/data/';
  const dashBody = { recent_days: 30, date_range: { start_date: R.startD, end_date: R.endD } };
  const dashJson = await axhr(B + 'overview/dashboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dashBody) });
  assertLogin(dashJson);
  const dash = dashJson.metrics || [];
  const dr = encodeURIComponent(JSON.stringify({ start_date: R.startD, end_date: R.endD }));
  const fansJson = await axhr(B + 'overview/dashboard/fans?recent_days=7&date_range=' + dr);
  assertLogin(fansJson);
  const fans = fansJson.metrics || [];
  const M = (a, en) => { const m = (a || []).find((x) => x.english_metric_name === en); return m ? m.metric_value : ''; };
  const Pt = (x) => x === '' || x == null ? '' : (Number(x) * 100).toFixed(2) + '%';
  const avgView = M(dash, 'avg_view_second'); const avgViewFmt = avgView === '' ? '' : Number(avgView).toFixed(2);
  const summaryCsv = toCsv([['周期', '投稿量', '主页访问', '总播放量', '总点赞量', '总评论量', '总分享量', '5秒完播率', '2秒跳出率', '封面点击率', '平均播放时长', '粉丝净增', '吸粉量', '脱粉量', '回访粉丝量', '总粉丝量'], [R.label, M(dash, 'publish_cnt'), M(dash, 'homepage_view_cnt'), M(dash, 'play_cnt'), M(dash, 'digg_cnt'), M(dash, 'comment_cnt'), M(dash, 'share_count'), Pt(M(dash, 'completion_rate_5s')), Pt(M(dash, 'bounce_rate_2s')), Pt(M(dash, 'cover_click_ratio')), avgViewFmt, M(fans, 'net_fans_cnt'), M(fans, 'new_fans_cnt'), M(fans, 'cancel_fans_cnt'), M(fans, 'home_view_fans_cnt'), M(fans, 'total_fans_cnt')]]);
  let posts = [], postCsv = '', postWarn = '';
  try {
    // 收集 work_list 的 items[]（含全部指标 metrics）+ aweme_list[]（含时长 duration），按作品 ID 关联
    let all = [], cursor = 0, guard = 0, itemIdSet = new Set();
    while (true) {
      const j = await axhr('https://creator.douyin.com/janus/douyin/creator/pc/work_list?status=0&count=40&max_cursor=' + cursor + '&scene=star_atlas&device_platform=android&aid=1128');
      assertLogin(j);
      const its = j.items || [], aws = j.aweme_list || [];
      // 本页：按 item.id === aweme.item_id 关联；避免依赖数组同序/同长，防止 A 的指标+B 的时长/ID 错配
      const awmap = new Map(); for (const aw of aws) { const k = aw && aw.item_id != null ? String(aw.item_id) : null; if (k != null) awmap.set(k, aw); }
      for (const it of its) { const k = it && it.id != null ? String(it.id) : null; all.push({ item: it, aweme: k != null ? (awmap.get(k) || null) : null }); if (k != null) itemIdSet.add(k); }
      for (const aw of aws) { const k = aw && aw.item_id != null ? String(aw.item_id) : null; if (k != null && !itemIdSet.has(k)) { all.push({ item: null, aweme: aw }); itemIdSet.add(k); } }
      if (!j.has_more || (!its.length && !aws.length)) break;
      const next = j.max_cursor || 0;
      if (next === cursor) break;                       // 游标不变，防死循环
      if (++guard > 200) break;                          // 安全上限
      cursor = next; await new Promise((r) => setTimeout(r, 600));
    }
    const metas = all.filter((it) => it.item && it.item.create_time && cDateYmd(it.item.create_time) >= R.startD && cDateYmd(it.item.create_time) <= R.endD).sort((a, b) => (b.item.create_time || 0) - (a.item.create_time || 0));
    const mOf = (it) => (it.item && it.item.metrics) || {};
    const pctM = (x) => (x == null || x === '') ? '' : (Number(x) * 100).toFixed(2) + '%';
    const srcName = (k) => ({ homepage_hot: '推荐页', familiar: '朋友页', follow: '关注页', homepage: '个人主页', search: '搜索' }[k] || k);
    const coverOf = (cur) => { const c = cur && cur.cover; if (!c) return ''; const o = Array.isArray(c) ? c[0] : c; return (o && o.url_list && o.url_list[0]) || ''; };
    const videoId = (it) => (it.aweme && (it.aweme.aweme_id || it.aweme.item_id)) || it.item.id;
    const coverFile = (it, i) => { const u = coverOf(it.item); return u ? String(i + 1).padStart(2, '0') + '_' + videoId(it) + '.jpg' : ''; };
    posts = [];
    let postRows = [];
    // 抖音单篇：全部字段接口直取（work_list items[] + play/source + search/keyword），无需打开详情页
    const singleHeader = ['作品标题', '发布日期', '封面', '作品时长', '播放量', '点赞量', '评论量', '分享量', '收藏量', '弹幕量', '完播率', '5秒完播率', '2秒跳出率', '平均播放时长', '涨粉量', '脱粉量', '粉丝播放占比', '最大流量来源', '搜索关键词'];
    const C = Math.max(1, Math.min(10, concurrency || 4));
    const rows = await pMap(C, metas, async (it, i) => {
      const cur = it.item, aw = it.aweme, m = mOf(it);
      const id = videoId(it);
      let maxSrc = '', kw = '';
      try { const s = await axhr('https://creator.douyin.com/janus/douyin/creator/data/item/play/source?aid=2906&item_id=' + id); const arr = (s.play_source || []); if (arr.length) { arr.sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0)); maxSrc = srcName(arr[0].key); } } catch (e) {}
      try { const k = await axhr('https://creator.douyin.com/janus/douyin/creator/data/item_analysis/search/keyword?aid=2906&id=' + id); const kwArr = ((k.inspire_search || []).concat(k.show_from || [])).map((x) => (typeof x === 'string') ? x : (x && (x.keyword || x.word || x.content || x.search_word || x.name)) || ''); kw = kwArr.filter(Boolean).join(', ') || '暂无数据'; } catch (e) { kw = ''; }
      const p = { publish: cDateTimeS(cur.create_time), duration: aw && aw.duration != null ? Math.floor(aw.duration / 1000) : '', title: (cur.description || '').replace(/\s+/g, ' ').slice(0, 200), plays: m.view_count, digg: m.like_count, comment: m.comment_count, share: m.share_count, collect: m.favorite_count, danmaku: m.danmaku_count, finish: pctM(m.completion_rate), f5: pctM(m.completion_rate_5s), bounce2s: pctM(m.bounce_rate_2s), avgPlay: m.avg_view_second != null ? String(Math.round(Number(m.avg_view_second) * 100) / 100) : '', absorb: m.subscribe_count, forfeit: m.unsubscribe_count, fanShare: pctM(m.fan_view_proportion), maxSrc, kw, coverUrl: coverOf(cur), coverFileName: coverFile(it, i) };
      return p;
    });
    posts = rows;
    postRows = rows.map((p) => [p.title, p.publish, p.coverFileName, p.duration, p.plays, p.digg, p.comment, p.share, p.collect, p.danmaku, p.finish, p.f5, p.bounce2s, p.avgPlay, p.absorb, p.forfeit, p.fanShare, p.maxSrc, p.kw]);
    postCsv = toCsv([singleHeader].concat(postRows));
  } catch (e) { postWarn = String((e && e.message) || e); }
  return { platform: '抖音', scopeLabel, periodName: R.label, period: R.label, rangeText: fmtRange(R.startD) + '-' + fmtRange(R.endD), summaryCsv, postCsv, posts, coverFolder: R.label + '_' + scopeLabel + '作品封面', count: posts.length, warning: postWarn ? '汇总数据提取成功，但作品列表获取失败，请重试（' + postWarn + '）' : '' };
}

// 提取完成通知（通知后台弹系统通知；弹窗若开着监听 extractDone 以恢复界面）。
function broadcastDone() {
  try { chrome.runtime.sendMessage({ type: 'extractDone' }).catch(() => {}); } catch (e) {}
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'extract') {
    const platform = msg.platform || '视频号';
    const period = msg.period || 'month';
    try { chrome.storage.local.set({ running: true, runningAt: Date.now() }).catch(() => {}); } catch (e) {}
    const finish = async (d) => {
      // 先把 running:false 与结果、按平台完成时间写入 storage，确保落库后再发完成消息/回包，
      // 避免弹窗在 extractDone/响应里读到旧的 running:true 而退回「提取中」。
      try {
        const v = await chrome.storage.local.get(['lastResultAtMap']);
        const map = Object.assign({}, (v && v.lastResultAtMap) || {});
        map[d.platform] = Date.now();
        await chrome.storage.local.set({ running: false, lastResult: d, lastResultAtMap: map });
      } catch (e) {}
      broadcastDone();
      sendResponse({ ok: true, data: d });
    };
    const fail = (e) => { try { chrome.storage.local.set({ running: false }).catch(() => {}); } catch (e2) {} sendResponse({ ok: false, error: String((e && e.message) || e) }); };
    if (platform === '视频号') { channelsExtract(period).then(finish).catch(fail); return true; }
    if (platform === '抖音') { douyinExtract(period, msg.concurrency).then(finish).catch(fail); return true; }
    sendResponse({ ok: false, error: '小红书 / 哔哩哔哩 暂未接入' }); return;
  }
  if (msg && msg.type === 'ping') { sendResponse({ ok: true }); return; }
});
