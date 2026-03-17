# No-Helmet Batch Analysis

Pipeline ini menganalisis file video lokal dengan decoder `ffmpeg`, mendeteksi `person` dan `helmet/hardhat` dari model PPE, lalu menghasilkan event `no_helmet` dengan timestamp, snapshot bukti, dan ringkasan JSON/CSV.

## Prasyarat

- `ffmpeg` dan `ffprobe` tersedia di `PATH`
- Python 3.11+
- Dependensi Python:

```bash
python3 -m pip install -r tools/no_helmet_analysis/requirements.txt
```

- Model PPE yang memiliki kelas `person` dan `helmet`/`hardhat`

## Format ROI

Contoh ROI tersimpan di [area_produksi.roi.json](/Users/abloer/my_project/dashboard-cv-ut/tools/no_helmet_analysis/area_produksi.roi.json).

```json
{
  "roi_id": "area-produksi-default",
  "normalized": true,
  "polygon": [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]]
}
```

Jika `normalized` bernilai `true`, koordinat ROI dibaca sebagai rasio terhadap ukuran frame.

## Menjalankan

```bash
python3 tools/no_helmet_analysis/analyze_no_helmet.py \
  --video-path "/Users/abloer/Downloads/Area_Produksi.mp4" \
  --roi-config-path tools/no_helmet_analysis/area_produksi.roi.json \
  --output-dir /tmp/area-produksi-no-helmet \
  --model-path /absolute/path/to/ppe-model.pt
```

Output:

- `summary.json`
- `events.csv`
- `snapshots/event-XXXX.jpg`

## Catatan

- Event dibuat bila seseorang di ROI terlihat tanpa helm minimal `3` frame berturut-turut.
- Event ditutup bila objek bersih/hilang selama `5` frame berturut-turut.
- ROI default saat ini memakai seluruh frame; sesuaikan poligon setelah preview kamera tersedia.

