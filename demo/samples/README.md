# 本轮可解析格式与合成样例

## 当前可用范围（2026-08-29）

[四图功能锁定](../../docs/development/demo/WIREFRAME_FUNCTION_LOCK.md)要求新增显式载入的榨汁杯合成案例、截图与Excel/CSV能力；旧“禁止新图片”不再是产品限制。TXT/CSV/JSON按白名单解析，XLSX由共享层本机解析已知指标列（抖音作品导出、榜单快照、metric约定表；区间估值不折算单值，整列全0按采集缺失处理），XLS旧格式仅接收。截图仍只接收预览，没有OCR。旧床底案例保留回归，不改名冒充榨汁杯。下面的文件是独立上传样例，不冒充榨汁杯数据；种子只含初始资料，不预设选择、执行或未来反馈。

仅供本地测试，所有数字均为合成。文件最多6份，单份10,000,000字节，总计20MiB；不支持PDF/HTML/SVG/视频。PNG/JPEG/WebP可接收预览，但没有OCR。不宣称已具备图片理解；已有历史图片原件仍保留、可查看。TXT真实读取，不自动当成结构化经营事实。

- [CSV样例](metrics.csv)：UTF-8，可带BOM。表头为metric,value,unit,subject,window_start,window_end,channel,cohort；支持双引号、转义引号与引号内换行，未知值留空。
- [JSON样例](metrics.json)：只接受demo.metrics.v1与metrics白名单；数字须为number或null，不将字符串自动转为数字。
- [TXT样例](notes.txt)：原文展示与行号验证，不能因文字相似就套用床底收纳箱输出。
- [XLSX榜单样例](live-ranking-sample.xlsx)：合成榜单快照（原始数据＋口径说明两个工作表），验证XLSX本机解析、区间估值按未知、口径说明进入核对提示；由`scripts/build-sample-xlsx.mjs`生成，可重新生成。

四个会话种子通过“演示指南”中的“载入示例”显式选择：juicer_cup_v1、underbed_complete_v1、one_sentence_v1、scope_conflict_v1。它们不包含未来反馈、分析、已选路径或执行历史；载入后仍须确认本轮问题。实际用户修改或新增反馈后取消全合成标记，原合成事实与历史来源仍保留标注。
