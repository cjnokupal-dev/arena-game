#!/data/data/com.termux/files/usr/bin/bash
# Packages the current state into a compact AI-friendly blob
cd ~/game
OUT=/sdcard/Download/arena-snapshot.txt
{
  echo "=== PROJECT.md ==="
  cat PROJECT.md 2>/dev/null
  echo
  echo "=== server.py ==="
  cat server.py
  echo
  echo "=== static/config/player.txt (first 50 lines) ==="
  head -50 static/config/player.txt
  echo
  echo "=== static/config/boss.txt (first 30 lines) ==="
  head -30 static/config/boss.txt
  echo
  echo "=== static/config/enemy.txt (first 30 lines) ==="
  head -30 static/config/enemy.txt
  echo
  echo "=== index.html (SIZE: $(wc -c < index.html) bytes) ==="
  echo "(index.html is too large to embed — paste separately if needed)"
  echo
  echo "=== STRUCTURE ==="
  find . -type f -not -path './arena.db*' | sort
} > "$OUT"
echo "[+] snapshot written to $OUT ($(wc -c < $OUT) bytes)"
