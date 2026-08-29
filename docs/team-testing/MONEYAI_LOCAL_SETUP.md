# 路芽｜队友本机 MoneyAI 与模型 API 配置

本页用于让每位队友在**自己的电脑**运行路芽，并通过主办方的 MoneyAI-Agents 接入自己选择的大模型 API。Claude Code 不是依赖；只要该 Provider 能在 MoneyAI 中配置并验证，就可以承载路芽的分析与资料整理。

```text
三页网页 → 本机 4188 同源后端 → 本机 MoneyAI sidecar → 队友选择的模型 Provider
```

网页不会读取 API Key，也不会直连模型厂商。API Key 只由本机 MoneyAI 保存，项目仓库不保存 `.env`、Key、账号令牌或 Provider 响应原文。

## 1. 准备

- Windows、PowerShell 5.1 或更高版本、Python 3.9 或更高版本。
- 已克隆并更新本仓库的 `master`。
- 已安装主办方 MoneyAI-Agents；安装路径可以不同，不要求放在 `D:` 盘。
- 准备任一 MoneyAI 支持的 Provider API Key。内置 Provider ID 取决于队友安装的 MoneyAI 版本，脚本会在 ID 不存在时列出当前可用 ID。

API Key 不要粘贴进聊天、Git 命令、README、截图、终端回执或浏览器。下面的脚本使用 PowerShell 安全输入框，Key 不作为命令行参数出现。

## 2. 首次配置并启动

在仓库根目录运行；将安装路径与 Provider ID 换成队友自己的值：

```powershell
.\scripts\start-luya-moneyai.ps1 `
  -MoneyAIHome 'D:\MoneyAI-Agents' `
  -ProviderId deepseek `
  -ConfigureProviderKey `
  -VerifyProvider `
  -EnableAnalysis `
  -EnableExtraction
```

脚本会依次：

1. 在仓库外创建 `%LOCALAPPDATA%\Luya\MoneyAI` 项目空间；
2. 启动一个只监听 `127.0.0.1` 的 MoneyAI sidecar；
3. 在本机输入并保存 Provider Key，设为默认 Provider；
4. 让 MoneyAI 做一次 Provider 验证；该步骤可能产生一次极小的模型调用；
5. 以前台方式启动路芽 4188 服务。

看到以下地址后，用同一台电脑的浏览器打开：

```text
http://127.0.0.1:4188/01-intake.html
```

按 `Ctrl+C` 停止。脚本只结束本次由它启动的 sidecar，不会停止端口上的未知进程。

常见内置 Provider ID 可能包括 `deepseek`、`siliconflow`、`zhipu-ai`、`moonshot`、`openrouter` 等，以队友本机脚本实际列出的 ID 为准。使用 OpenAI 兼容的自定义服务时，先在 MoneyAI 的“模型供应商”设置中添加 Provider（base URL、协议、模型名均只留在本机），再把它的 ID 传给本脚本。

## 3. 后续启动

API Key 已由 MoneyAI 保存且 Provider 状态仍为 `valid` 时，不必再次输入：

```powershell
.\scripts\start-luya-moneyai.ps1 `
  -MoneyAIHome 'D:\MoneyAI-Agents' `
  -ProviderId deepseek `
  -EnableAnalysis `
  -EnableExtraction
```

若更换 Key、Provider 或 MoneyAI 升级后状态不再有效，重新加 `-ConfigureProviderKey -VerifyProvider`。脚本不会在未验证 Provider 时打开分析／提取能力。

若只查看 Demo、不调用模型：

```powershell
python -B -X utf8 server/app.py --port 4188
```

## 4. 可移植参数

| 参数 | 含义 |
| --- | --- |
| `-MoneyAIHome` | 队友自己的 MoneyAI-Agents 安装目录；也可设本机环境变量 `MONEYAI_HOME` |
| `-ProjectDir` | 路芽专用 MoneyAI 数据目录，必须在仓库外；默认 `%LOCALAPPDATA%\Luya\MoneyAI` |
| `-MoneyAIPort` | MoneyAI sidecar 端口，默认 `31416` |
| `-DemoPort` | 路芽本机服务端口，默认 `4188` |
| `-ProviderId` | MoneyAI 中已存在的内置或自定义 Provider ID |
| `-ConfigureProviderKey` | 安全提示输入并在本机 MoneyAI 保存 Key |
| `-VerifyProvider` | 由 MoneyAI 验证模型 Provider，可能产生一次调用 |
| `-EnableAnalysis` / `-EnableExtraction` | Provider 验证有效后启用分析／资料整理 |
| `-EnableHistory` | 启用项目空间的决策写入；不等于历史读回已验证 |
| `-HistoryReadVerified` | 仅在该电脑已验证重启读回和空项目隔离后，与 `-EnableHistory` 一起使用 |

不使用启动脚本时，`server/app.py` 也接受以下本机环境变量：

```text
LUYA_DEMO_PORT
LUYA_MONEYAI_URL
LUYA_MONEYAI_PROJECT_DIR
LUYA_MONEYAI_ANALYSIS_ENABLED
LUYA_MONEYAI_EXTRACTION_ENABLED
LUYA_MONEYAI_HISTORY_ENABLED
LUYA_MONEYAI_HISTORY_READ_VERIFIED
```

布尔值仅接受 `true/false`、`1/0`、`yes/no` 或 `on/off`。命令行参数仍可覆盖环境变量；`--no-moneyai-analysis-enabled` 等反向参数可显式关闭本机旧环境中的能力开关。

## 5. 最小确认

启动后先打开：

```text
http://127.0.0.1:4188/api/moneyai/status
```

准备调用分析时至少应看到：

- `contractVersion` 为 `luya.moneyai.v1`；
- `configured`、`serviceReachable`、`projectSpaceConfigured` 为 `true`；
- `analysisReady` 与／或 `extractionReady` 为 `true`。

状态页可达只说明本机链路配置就绪，不代表页面、模型答案或经营效果已经验收。首次调用只使用合成榨汁杯材料；不得把商家原始流水、个人资料或未获准附件发送给外部模型。

遇到端口占用时不要杀未知进程，改用 `-MoneyAIPort` 或 `-DemoPort`。Provider 验证失败时保留错误码和脱敏摘要，不提交 Key、完整请求、完整响应或 MoneyAI 本地数据目录。
