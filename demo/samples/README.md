# 本轮可解析格式与合成样例

## 当前可用范围（2026-08-29）

[四图功能锁定](../../docs/development/demo/WIREFRAME_FUNCTION_LOCK.md)中的显式榨汁杯初始资料、图片接收和 Excel 原件保存已接回当前界面。下面的文件是独立上传样例，不冒充榨汁杯数据；种子只含初始资料，不预设选择、执行或未来反馈。

仅供本地测试，所有数字均为合成。文件最多 6 份，单份 10,000,000 字节，总计 20 MiB。PNG/JPEG/WebP 可接收预览，但没有 OCR；XLSX/XLS 保存原件但不解析内容。PDF/HTML/SVG/视频暂不支持。TXT 真实读取，不自动当成结构化经营事实。

- [CSV样例](metrics.csv)：UTF-8，可带BOM。表头为metric,value,unit,subject,window_start,window_end,channel,cohort；支持双引号、转义引号与引号内换行，未知值留空。
- [JSON样例](metrics.json)：只接受demo.metrics.v1与metrics白名单；数字须为number或null，不将字符串自动转为数字。
- [TXT样例](notes.txt)：原文展示与行号验证，不能因文字相似就套用床底收纳箱输出。

四个会话种子通过“演示指南”中的“载入示例”显式选择：juicer_cup_v1、underbed_complete_v1、one_sentence_v1、scope_conflict_v1。它们不包含未来反馈、分析、已选路径或执行历史；载入后仍须确认本轮问题。修改或新增反馈后不再以 fixtureId 代表整轮均为合成，原合成事实与历史来源仍保留标注。
