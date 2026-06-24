#!/bin/bash
# Usage: bash send_rechnung.sh CHAT_ID DATEI_URL
CHAT_ID=$1
DATEI_URL=$2
TOKEN=$(cat /home/ubuntu/.paperclip/telegram_token)
FILENAME=$(basename "$DATEI_URL")
curl -s "$DATEI_URL" -o "/tmp/${FILENAME}"
curl -s -X POST "https://api.telegram.org/bot${TOKEN}/sendDocument" \
  -F "chat_id=${CHAT_ID}" \
  -F "document=@/tmp/${FILENAME}"
