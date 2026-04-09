# Model Baseline

Folder ini menyimpan baseline model yang dipakai sistem saat ini.

## PPE baseline

- File: `/Users/abloer/my_project/dashboard-cv-ut/models/detect-construction-safety-best.pt`
- Dipakai untuk:
  - `PPE • No Helmet`
  - `PPE • No Safety Vest`
  - `HSE • Safety Rules`
  - `HSE • Working at Height`
- Sumber baseline:
  - repo komunitas `rahilmoosavi/DetectConstructionSafety`

## Life vest baseline

- File: `/Users/abloer/my_project/dashboard-cv-ut/models/life-vest-baseline.pt`
- Dipakai untuk:
  - `PPE • No Life Vest`
- Catatan:
  - baseline ini dipisahkan dari PPE umum supaya model khusus life vest dapat diganti lewat `Models` dan `Deployment Gate` tanpa mengganggu helmet/vest proyek.

## Operations general baseline

- File: `/Users/abloer/my_project/dashboard-cv-ut/models/yolo11l.pt`
- Dipakai untuk:
  - `Operations • Red Light Violation`
  - `Operations • Dump Truck Bed Open`
- Sumber baseline:
  - model detect resmi Ultralytics (`YOLO11l`)
- Catatan:
  - ini baseline umum untuk person/vehicle/truck/traffic light.
  - untuk `Dump Truck Bed Open`, model ini hanya baseline awal dan tetap disarankan diganti/fine-tune dengan model state bak terbuka/tertutup khusus.

Jika bobot model belum ada di path yang dipakai modul, unduh dulu lalu restart backend lokal.
