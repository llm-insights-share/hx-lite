---
check_type: shell
---

## 检查意图

单元测试（变更相关）。

通过本门禁后再进入下一交付环节。

```bash
set -euo pipefail
if [ -f package.json ] && grep -q '"test"' package.json; then
  npm test -- --passWithNoTests 2>/dev/null || npm test
elif command -v pytest >/dev/null 2>&1; then
  pytest -q
else
  echo "skip: no test runner"; exit 0
fi
```
