# HEARTBEAT.md — Automatische Aufgaben

## Täglicher Fristen-Report (08:00 Uhr)
1. Fristen-DB abfragen (DS: `326b7546-581d-8080-8b3c-000b91a0e801`)
2. Filter: Status "Offen", Fälligkeitsdatum ≤ heute + 7 Tage
3. Nach Zuständigem gruppieren
4. Kompakte Zusammenfassung formulieren
5. An Steuerberater senden (ID: `8764554621`)

Nur senden wenn ≥ 1 offene Frist gefunden. Sonst: `HEARTBEAT_OK`

## Wöchentlicher BWA-Report (Montag 09:00)
1. Auswertungen-DB abfragen (DS: `326b7546-581d-80bc-9b9e-000b8cb9faa7`)
2. Top 5 Mandanten nach Ergebnis ermitteln
3. Vergleich zur Vorwoche wenn Daten vorhanden
4. An Steuerberater senden (ID: `8764554621`)

## Überfällige Rechnungen (täglich 17:00)
1. Rechnungen-DB abfragen (DS: `4b039286-850d-4d7e-8789-0f688bf831d0`)
2. Filter: Status "Offen" UND Fälligkeitsdatum < heute
3. Liste mit Mandant, Betrag, Tage überfällig
4. An Steuerberater senden (ID: `8764554621`)

Nur senden wenn ≥ 1 überfällige Rechnung. Sonst: `HEARTBEAT_OK`
