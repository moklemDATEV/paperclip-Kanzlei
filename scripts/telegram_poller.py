#!/usr/bin/env python3
import json, requests, time, os

TOKEN = open('/home/ubuntu/.paperclip/telegram_token').read().strip()
NOTION_KEY = open('/home/ubuntu/.config/notion/api_key').read().strip()
DB_ID = "cfc319c1-fa4b-4ee6-9c89-af611baefd44"
STATE_FILE = "/home/ubuntu/.telegram_offset"
EC2_IP = "13.49.175.198"

def get_offset():
    try:
        return int(open(STATE_FILE).read().strip())
    except:
        return 0

def save_offset(offset):
    open(STATE_FILE, 'w').write(str(offset))

def download_file(file_id):
    resp = requests.get(f"https://api.telegram.org/bot{TOKEN}/getFile?file_id={file_id}")
    file_path = resp.json()['result']['file_path']
    filename = f"RE-EINGANG-{int(time.time())}.pdf"
    url = f"https://api.telegram.org/file/bot{TOKEN}/{file_path}"
    r = requests.get(url)
    dest = f"/var/www/html/rechnungen/{filename}"
    open(dest, 'wb').write(r.content)
    return filename, f"http://{EC2_IP}/rechnungen/{filename}"

def create_notion_entry(filename, datei_url, chat_id):
    import datetime
    data = {
        "parent": {"database_id": DB_ID},
        "properties": {
            "Rechnungsnummer": {"title": [{"text": {"content": filename.replace('.pdf', '')}}]},
            "Status": {"select": {"name": "Eingegangen"}},
            "Datei URL": {"url": datei_url},
            "Rechnungsdatum": {"date": {"start": datetime.date.today().isoformat()}},
            "Notizen": {"rich_text": [{"text": {"content": f"Per Telegram eingegangen (chat: {chat_id})"}}]}
        }
    }
    resp = requests.post(
        "https://api.notion.com/v1/pages",
        headers={"Authorization": f"Bearer {NOTION_KEY}", "Notion-Version": "2025-09-03", "Content-Type": "application/json"},
        json=data
    )
    return resp.json().get('object') == 'page'

def send_message(chat_id, text):
    requests.post(f"https://api.telegram.org/bot{TOKEN}/sendMessage",
        json={"chat_id": chat_id, "text": text})

print("🦞 Telegram File Poller (Paperclip) gestartet...")
while True:
    try:
        offset = get_offset()
        resp = requests.get(f"https://api.telegram.org/bot{TOKEN}/getUpdates?offset={offset}&timeout=10")
        updates = resp.json().get('result', [])

        for update in updates:
            save_offset(update['update_id'] + 1)
            msg = update.get('message', {})
            chat_id = msg.get('chat', {}).get('id')

            if 'document' in msg:
                file_id = msg['document']['file_id']
                print(f"📄 Dokument empfangen von {chat_id}")
                filename, url = download_file(file_id)
                if create_notion_entry(filename, url, chat_id):
                    print(f"  ✅ Notion-Eintrag angelegt: {url}")
                else:
                    print(f"  ❌ Notion-Eintrag fehlgeschlagen")

            elif 'photo' in msg:
                file_id = msg['photo'][-1]['file_id']
                print(f"📷 Foto empfangen von {chat_id}")
                filename, url = download_file(file_id)
                filename = filename.replace('.pdf', '.jpg')
                if create_notion_entry(filename, url, chat_id):
                    print(f"  ✅ Notion-Eintrag angelegt: {url}")

    except Exception as e:
        print(f"❌ Fehler: {e}")
    time.sleep(2)
