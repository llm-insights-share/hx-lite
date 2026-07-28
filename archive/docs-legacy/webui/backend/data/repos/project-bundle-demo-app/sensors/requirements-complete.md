---
check_type: shell
---

## 检查意图

Change 需求/提案完备。

通过本门禁后再进入下一交付环节。

```bash
set -euo pipefail
CHANGE="${HX_CHANGE:-${CHANGE:-}}"
if [ -z "$CHANGE" ] && [ -f .nhx/session.json ]; then
  CHANGE=$(python3 -c "import json;print(json.load(open('.nhx/session.json')).get('change') or '')" 2>/dev/null || true)
fi
if [ -z "$CHANGE" ] && [ -d harnessX/changes ]; then
  CHANGE=$(ls -1t harnessX/changes 2>/dev/null | head -1 || true)
fi
if [ -z "$CHANGE" ] && [ -d openspec/changes ]; then
  CHANGE=$(ls -1t openspec/changes 2>/dev/null | head -1 || true)
fi
ROOT=""
if [ -n "${CHANGE:-}" ]; then
  for base in harnessX/changes openspec/changes; do
    if [ -d "$base/$CHANGE" ]; then ROOT="$base/$CHANGE"; break; fi
  done
fi
test -n "$ROOT" || { echo "未找到 change 目录（设置 HX_CHANGE 或创建 harnessX/changes/<id>）"; exit 1; }
test -f "$ROOT/proposal.md" -o -f "$ROOT/requirements.md" -o -f "$ROOT/specs/requirements.md" \
  || { echo "缺少 proposal.md / requirements.md: $ROOT"; exit 1; }
echo "ok: $ROOT"
```
