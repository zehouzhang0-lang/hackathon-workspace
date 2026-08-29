#!/usr/bin/env bash
set -euo pipefail

readonly MONEYAI_NODE="/Applications/MoneyAI-Agents.app/Contents/Resources/nodejs/bin/node"
readonly MONEYAI_SERVER="/Applications/MoneyAI-Agents.app/Contents/Resources/server-dist.js"
readonly RUNTIME_DIR="${TMPDIR:-/tmp}/douyin-conversion-agent-moneyai"

if [[ ! -x "$MONEYAI_NODE" || ! -f "$MONEYAI_SERVER" ]]; then
  echo "未找到MoneyAI-Agents运行文件，请确认应用已安装。" >&2
  exit 1
fi

mkdir -p "$RUNTIME_DIR"

exec env \
  MYAGENTS_RUNTIME=codex \
  MYAGENTS_RUNTIME_SOURCE=system-cli \
  "$MONEYAI_NODE" "$MONEYAI_SERVER" \
  --port 31416 \
  --myagents-sidecar \
  --no-pre-warm \
  --agent-dir "$RUNTIME_DIR"
