# Panduan Konfigurasi Database PocketBase v1.0

Gunakan panduan ini untuk membuat tabel (Collections) di Admin UI PocketBase (http://127.0.0.1:8090/_/).

## Tabel yang Dibutuhkan:
- `fleet_units`: Data armada (Excavator, Truck, dll).
- `activity_logs`: Catatan aktivitas logistik/unit.
- `productivity_metrics`: Metrik performa per jam.
- `daily_summary`: Ringkasan harian.
- `reports`: Data laporan yang digenerate.

*Pastikan API Rules diset ke "Public" agar dashboard bisa menarik data tanpa login admin.*
