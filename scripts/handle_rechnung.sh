#!/bin/bash
NOTION_KEY=$(cat ~/.config/notion/api_key)
TOKEN=$(cat /home/ubuntu/.paperclip/telegram_token)
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
FILENAME="RE-EINGANG-${TIMESTAMP}.pdf"
EINGEGANGEN="Per Telegram eingegangen am $(date '+%d.%m.%Y um %H:%M Uhr')"

UPDATES=$(curl -s "https://api.telegram.org/bot${TOKEN}/getUpdates?limit=10&offset=-10")

FILE_ID=$(echo $UPDATES | python3 -c "
import json, sys
data = json.load(sys.stdin)
results = data.get('result', [])
for update in reversed(results):
    msg = update.get('message', {})
    if 'document' in msg:
        print(msg['document']['file_id'])
        break
    elif 'photo' in msg:
        print(msg['photo'][-1]['file_id'])
        break
" 2>/dev/null)

if [ -z "$FILE_ID" ]; then
    echo "ERROR:Keine Datei in letzten Nachrichten gefunden"
    exit 1
fi

FILE_PATH=$(curl -s "https://api.telegram.org/bot${TOKEN}/getFile?file_id=${FILE_ID}" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['file_path'])" 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
    echo "ERROR:Datei-Pfad nicht abrufbar"
    exit 1
fi

curl -s "https://api.telegram.org/file/bot${TOKEN}/${FILE_PATH}" -o "/var/www/html/rechnungen/${FILENAME}"

FILESIZE=$(stat -c%s "/var/www/html/rechnungen/${FILENAME}" 2>/dev/null || echo 0)
if [ "$FILESIZE" -lt 100 ]; then
    echo "ERROR:Download fehlgeschlagen (${FILESIZE} bytes)"
    exit 1
fi

DATEI_URL="http://13.49.175.198/rechnungen/${FILENAME}"

RESPONSE=$(curl -s -X POST "https://api.notion.com/v1/pages" \
  -H "Authorization: Bearer ${NOTION_KEY}" \
  -H "Notion-Version: 2025-09-03" \
  -H "Content-Type: application/json" \
  -d "{
    \"parent\": {\"database_id\": \"cfc319c1-fa4b-4ee6-9c89-af611baefd44\"},
    \"properties\": {
      \"Rechnungsnummer\": {\"title\": [{\"text\": {\"content\": \"RE-EINGANG-${TIMESTAMP}\"}}]},
      \"Status\": {\"select\": {\"name\": \"Eingegangen\"}},
      \"Datei URL\": {\"url\": \"${DATEI_URL}\"},
      \"Rechnungsdatum\": {\"date\": {\"start\": \"$(date +%Y-%m-%d)\"}},
      \"Eingegangen am\": {\"rich_text\": [{\"text\": {\"content\": \"${EINGEGANGEN}\"}}]},
      \"Notizen\": {\"rich_text\": [{\"text\": {\"content\": \"Per Telegram eingegangen\"}}]}
    }
  }")

if echo $RESPONSE | python3 -c "import json,sys; exit(0 if json.load(sys.stdin).get('object')=='page' else 1)" 2>/dev/null; then
    echo "SUCCESS:${DATEI_URL}"
else
    MSG=$(echo $RESPONSE | python3 -c "import json,sys; print(json.load(sys.stdin).get('message','unknown'))" 2>/dev/null)
    echo "ERROR:${MSG}"
fi
