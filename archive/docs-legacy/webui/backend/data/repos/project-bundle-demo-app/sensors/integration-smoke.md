---
check_type: shell
---

## 检查意图

集成冒烟。

通过本门禁后再进入下一交付环节。

```bash
set -euo pipefail
if [ -f package.json ] && grep -qE '"test:smoke"|"smoke"' package.json; then
  npm run test:smoke 2>/dev/null || npm run smoke
else
  echo "skip: define npm script test:smoke for real smoke"; exit 0
fi
```
