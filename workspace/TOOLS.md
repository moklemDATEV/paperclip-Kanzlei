# TOOLS.md — Technische Konfiguration

## Steuerberater
- Telegram ID: `8764554621`
- Alle Heartbeat-Reports und proaktiven Nachrichten → an diese ID

## Notion Datenbanken
| Name | data_source_id |
|------|----------------|
| Mandanten | `326b7546-581d-80c1-8ca2-000b7a632ed1` |
| Buchungssätze | `326b7546-581d-8031-be4b-000b87de342f` |
| Kontierungen | `326b7546-581d-8090-b63a-000b2e78b5d1` |
| Auswertungen | `326b7546-581d-80bc-9b9e-000b8cb9faa7` |
| Fristen | `326b7546-581d-8080-8b3c-000b91a0e801` |
| Rechnungen DS | `4b039286-850d-4d7e-8789-0f688bf831d0` |
| Rechnungen DB | `cfc319c1-fa4b-4ee6-9c89-af611baefd44` |

Für **Lesen**: data_source_id → POST `https://api.notion.com/v1/data_sources/{id}/query`
Für **Schreiben**: database_id → POST `https://api.notion.com/v1/pages`

## Notion API
- Token: `~/.config/notion/api_key`
- Version: `2025-09-03`

## Server
- EC2 IP: `13.49.175.198`
- Rechnungen Ordner: `/var/www/html/rechnungen/`
- Rechnungen URL: `http://13.49.175.198/rechnungen/`
- Paperclip Config: `~/.paperclip/instances/default/config.json`
- Telegram Token: `cat /home/ubuntu/.paperclip/telegram_token`

## Scripts
- Datei-Download & Notion-Upload: `~/handle_rechnung.sh`
- PDF-Generator: `~/venv/bin/python3` + reportlab

## Telegram Commands
### Mandanten
| Command | Verhalten |
|---------|-----------|
| `/start` | Begrüßung + alle Commands |
| `/rechnung_hochladen` | Mandanten-ID abfragen, dann Datei-Upload starten |
| `/meine_rechnungen` | Mandanten-ID abfragen, nur eigene Rechnungen zeigen |
| `/hilfe_mandant` | Commands für Mandanten anzeigen |

### Steuerberater
| Command | Verhalten |
|---------|-----------|
| `/hilfe_berater` | Alle Berater-Commands |
| `/offene_rechnungen` | Status Eingegangen + Offen |
| `/fristen` | Offene Fristen nächste 30 Tage |
| `/mandanten` | Alle aktiven Mandanten |
| `/bwa` | Top 5 Mandanten nach Ergebnis |
| `/berater_auslastung` | Offene Fristen je Berater |

## /start Antwort
```
👋 Willkommen bei DATEVLab!

Als Mandant:
/rechnung_hochladen — Rechnung einreichen
/meine_rechnungen — Status deiner Rechnungen
/hilfe_mandant — Alle Optionen

Als Steuerberater:
/hilfe_berater — Alle Berater-Funktionen
```

## Buchungsstatus
`Eingegangen` → neu | `Offen` → unbezahlt | `Gebucht` → erfasst | `Bezahlt` → abgeschlossen | `Überfällig` → überfällig
