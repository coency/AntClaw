# 新平台接口验证记录

验证日期：2026-09-22。来源：用户扫码登录的独立 Chrome 创作者后台；仅检查数据页面。未保存 Cookie、Authorization、签名值或账号个人资料。

## 小红书

接口基址：`https://creator.xiaohongshu.com`。以下均为页面实际发起的 GET 请求。

| 用途 | 路径 | 已确认行为 |
| --- | --- | --- |
| 账号汇总 | `/api/galaxy/v2/creator/datacenter/account/base` | `data.seven`、`data.thirty`，各自带 `begin_time`、`end_time` 及逐日数组 |
| 作品列表 | `/api/galaxy/creator/datacenter/note/analyze/list` | `post_begin_time`、`post_end_time` 为毫秒时间戳；`type=0`、`page_size=10`、`page_num=1`；返回 `data.note_infos` 和 `data.total` |
| 单篇详情 | `/api/galaxy/creator/datacenter/note/base` | 参数 `note_id`；返回笔记信息、总体指标和 `day`、`hour` 时间序列 |

### 已确认字段

- 列表：`id`、`post_time`、`type`、`cover_url`、`imp_count`、`read_count`、`like_count`、`comment_count`、`fav_count`、`share_count`、`increase_fans_count`、`danmaku_count`、`view_time_avg`、`coverClickRate`。
- 详情：`note_info` 包含正文 `desc`、封面及发布时间；正文不能无条件当作标题。列表中的标题可能缺失，网页也会显示“无标题笔记”。
- 详情的 `view_time_avg_with_double` 保留小数；列表的 `view_time_avg` 在样本中只有整数。列表 `coverClickRate=0.127` 对应详情 `cover_click_rate=12.7` 和页面 12.7%，单位必须分别处理。
- 汇总包含曝光、观看、互动、发布、粉丝增减和主页访客等计数及逐日数组；比率和平均值不能直接按日求和。

### 口径及限制

- 内容分析页面注明“仅支持查看近半年发布的笔记数据（不含未发布的定时笔记）”；日期控件标为“笔记首发时间”。列表日期条件不是互动统计周期。
- 账号概览页面提供近 7 日、近 30 日。本次账号汇总的 30 日数组覆盖 2026-08-23 至 2026-09-21，不能据此导出完整的 2026 年 8 月汇总。
- 上一自然周计数可考虑从完整覆盖该周的逐日数组计算，但须逐字段验证日期覆盖及求和；尚未完成导出对照。
- 单篇样本有逐日计数，但尚未验证较老作品的时间序列覆盖范围，不承诺任意周期增量。
- 页面正常汇总请求带 Authorization、Cookie、X-S、X-S-Common、X-T 等请求头。只记录头名称，未保存值。
- 在登录页面中用普通 `fetch(..., {credentials:'include'})` 请求上一自然周列表，实测 HTTP 406、`code=-1`、`success=false`。尚不能复用现有内容脚本的普通 fetch 采集方式；需要进一步验证站内请求机制或读取页面正常请求响应的方案。
- 当前仅定位并验证页面请求，尚未实现扩展接入、封面下载、完整分页和 CSV 对照测试。

## B 站

已确认登录状态并检查数据中心。主页面 `/platform/data-up/video/` 内嵌 `/york/data-center-web/dataCenter/video`；自动化定位控件时需进入对应 iframe。

接口基址：`https://member.bilibili.com`，以下为页面实际使用的 GET 接口。

| 用途 | 路径及参数 | 已确认行为 |
| --- | --- | --- |
| 账号区间总计 | `/x/web/data/v2/overview/stat/num?period=2&tab=0` | `period=0` 近7天，`period=2` 近90天，不能把预设总计直接当自然周/月 |
| 账号逐日趋势 | `/x/web/data/v2/overview/stat/graph?period=2&s_locale=zh_CN&type=play` | `data.tendency` 和 `data.data_tendency.play`，每项 `date_key`（秒）、`total_inc`、`sub_total_inc` |
| 作品列表 | `/x/web/data/archive/index?pn=1&ps=20&scene=archive_compare&order=0` | `data.list`、`data.pager`，后者包含 `pn`、`ps`、`total` |
| 作品对比 | `/x/web/data/archive_diagnose/compare?size=10` | 列表含发布时间、时长和累计互动等指标；有 `bvid` 变体；尚未验证能否覆盖任意作品 |
| 单篇详情 | `/x/web/data/v3/archive/view?bvid=<作品BV号>` | 已观察到真实页面请求，结构待进一步验证 |
| 单篇分析 | `/x/web/data/archive_diagnose/play_analyze?bvid=<作品BV号>` | 已观察到真实页面请求，结构待进一步验证 |

### 已验证结果

- 在数据中心页面中通过普通 `fetch` 携带当前登录态读取列表及90天播放趋势，均返回 HTTP 200、业务 `code=0`。
- 播放趋势返回90天数据，本次更新截至2026-09-20。筛选2026-09-14至09-20，覆盖7天、播放合计29，与页面近7天数值一致。
- 同一数组筛选2026-08-01至08-31，覆盖31天、播放合计13。已验证完整日期覆盖及本地计算；尚未与月度官方导出作独立对照。
- 列表包含 `aid`、`bvid`、`title`、`cover`、`ctime`、`pubtime`、`duration`、`stat`、`real_stat`。筛选发布时间应使用 `pubtime`，不是稿件创建时间 `ctime`。
- 列表存在离线和实时两组指标，样本播放数为24与25；导出应明确选择同一种更新时间口径，不能混用。
- 页面作品对比明确标为“历史累计数据”。`full_play_ratio=6005` 对应“平均播放进度”约60.1%，不是完播率；比例字段不能沿用其他平台的单位。
- 封面主机在样本中为 `i0.hdslb.com`、`i1.hdslb.com`、`i2.hdslb.com`，下载和 HTTPS 可用性尚未实测。
- 其他汇总指标类型、多页列表、单篇完整字段、封面 ZIP、扩展内实际请求与 CSV 对照测试仍需完成。

## 当前交付状态

本文件为接入前的实测记录。现有扩展业务代码尚未改变，小红书和 B 站选项仍未启用。后续接入必须保留真实日期范围、部分失败提示和数据口径，不用近30天替代上一个自然月，也不把缺失统计填成0。
