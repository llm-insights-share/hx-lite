---
check_type: shell
---

## 检查意图

缺陷关闭确认。

通过本门禁后再进入下一交付环节。

```bash
set -euo pipefail
FILE="docs/test/bugs.md"
if [ ! -f "$FILE" ]; then
  echo "no bugs.md — treat as closed"; exit 0
fi
if grep -Eiq '^\s*[-*]\s*\[( |open|todo)\]' "$FILE"; then
  echo "仍有未关闭缺陷条目: $FILE"; exit 1
fi
echo "bugs closed ok"
```
