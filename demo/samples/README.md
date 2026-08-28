# 本轮可解析格式与合成样例

仅供本地测试，所有数字均为合成。文件最多6份，单份5MiB，总计20MiB；不支持PDF/XLSX/HTML/SVG/视频。图片可接收与预览，无OCR时内容待核对。TXT真实读取，不自动当成结构化经营事实。

- [CSV样例](metrics.csv)：UTF-8，可带BOM。表头为metric,value,unit,subject,window_start,window_end,channel,cohort；支持双引号、转义引号与引号内换行，未知值留空。
- [JSON样例](metrics.json)：只接受demo.metrics.v1与metrics白名单；数字须为number或null，不将字符串自动转为数字。
- [TXT样例](notes.txt)：原文展示与行号验证，不能因文字相似就套用床底收纳箱输出。

三个会话种子通过页头“载入示例”显式选择：underbed_complete_v1、one_sentence_v1、scope_conflict_v1。它们不包含未来反馈、分析、已选路径或执行历史；载入后仍须确认本轮问题。实际用户修改或新增反馈后取消全合成标记，原合成事实的来源标签仍保留。
