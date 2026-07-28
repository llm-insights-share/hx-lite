---
check_type: shell
---

## 检查意图

规格追溯检查。

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
if [ -d openspec ] || [ -d harnessX ]; then
  echo "spec root present"
else
  echo "缺少 openspec/ 或 harnessX/"; exit 1
fi
if [ -n "${CHANGE:-}" ]; then
  for base in harnessX/changes openspec/changes; do
    if [ -d "$base/$CHANGE" ]; then
      echo "change: $base/$CHANGE"
      exit 0
    fi
  done
fi
echo "warn: no active change, root ok"
```
