// background.js —— MV3 后台服务工作线程
// 提取完成后弹系统通知（即使用户已关掉弹窗/切到别的页面也能看到）

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'extractDone') { showDoneNotification(); }
  // 其它类型（如 extractProgress）由弹窗处理，这里不响应
});

// 提取完成后弹系统通知（即使用户已关掉弹窗/切到别的页面也能看到）
function showDoneNotification() {
  try {
    let text = '数据提取完成，可打开扩展下载 CSV';
    try {
      chrome.storage.local.get('lastResult').then((v) => {
        const r = v && v.lastResult;
        if (r && r.platform && r.count != null) text = r.platform + '：提取完成，共 ' + r.count + ' 条单篇，可打开扩展下载 CSV';
        createNotify(text);
      }).catch(() => createNotify(text));
    } catch (e) { createNotify(text); }
  } catch (e) {}
}
function createNotify(message) {
  try {
    chrome.notifications.create({
      type: 'basic', iconUrl: chrome.runtime.getURL('icon128.png'),
      title: '爬爬蚁', message,
    }, (id) => { try { if (id) setTimeout(() => chrome.notifications.clear(id), 8000); } catch (e) {} });
  } catch (e) {}
}
