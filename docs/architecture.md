# Vulnerable Lab Platform Architecture & Engineering Guide

## 1. Vision & Overview
Biến repository thành nền tảng Lab Quản lý & Đánh giá Lỗ hổng Bảo mật (Vulnerable Lab Platform) kết hợp giữa các target chuẩn công nghiệp (OWASP Juice Shop, OWASP crAPI, DVWA, OWASP WebGoat) và các custom micro-targets mô phỏng rủi ro logic thực tế.

Mô hình ranh giới: **Control Plane (Lab Manager)** hoàn toàn tách biệt với **Target Plane (Isolated Targets)**.

```
+-------------------------------------------------------------------------------+
|                        CONTROL PLANE (Management Net)                         |
|  - Lab Web / FairEnrol (React / Vite)                                         |
|  - Lab Manager REST API (Port 4000)                                           |
|  - Target Registry & Anti-SSRF Scope Enforcement                              |
|  - Lifecycle Controller & Reset Engine                                        |
|  - Test Engine & Evidence Anchoring (SHA-256 Checksums)                       |
+-------------------------------------------------------------------------------+
                                    | (Authorized Scope & Health Probes)
                                    v
+-------------------------------------------------------------------------------+
|                       TARGET PLANE (sec-lab-target-net)                       |
|  [External Targets via Docker Compose]                                        |
|   ├── OWASP Juice Shop (Port 3000)                                            |
|   ├── OWASP crAPI Microservices (Port 8888)                                   |
|   ├── DVWA (Port 8082)                                                        |
|   └── OWASP WebGoat (Port 8083)                                               |
|                                                                               |
|  [Custom Micro-Targets]                                                       |
|   ├── custom-api-vault (BOLA/IDOR, Mass Assignment, Rate-Limit)               |
|   └── custom-business-logic (FairEnrol Insecure Variant Benchmark)            |
+-------------------------------------------------------------------------------+
```

---

## 2. Các thành phần đã triển khai

### 2.1. Target Registry & Manifests (`targets/catalog/`)
Tất cả các target phải đăng ký qua manifest định dạng chuẩn trước khi được phép quét (chống SSRF):
- `targets/catalog/juice-shop.yaml`
- `targets/catalog/crapi.yaml`
- `targets/catalog/dvwa.yaml`
- `targets/catalog/webgoat.yaml`
- `targets/catalog/custom-api.yaml`
- `targets/catalog/custom-business-logic.yaml`

### 2.2. Isolated Docker Compose Topology (`deploy/compose/`)
- `deploy/compose/lab-platform.yaml`: Thiết lập 2 bridge network độc lập (`sec-lab-mgmt-net` và `sec-lab-target-net`). Cấm target truy cập Docker socket và host internal networks.
- `deploy/compose/juice-shop.yaml`
- `deploy/compose/crapi.yaml`
- `deploy/compose/dvwa.yaml`
- `deploy/compose/webgoat.yaml`

### 2.3. Deliberately Vulnerable Custom Target (`targets/custom-api/server.js`)
Mục tiêu độc lập phục vụ benchmark scanner:
- **BOLA-01**: `GET /api/records/:id` cho phép user Alice đọc bệnh án nhạy cảm của Bob.
- **MASS-ASSIGN-01**: `POST /api/profile` cho phép payload tự gán `{ role: "admin" }` leo thang đặc quyền.
- **Reset Contract**: `POST /api/reset` trả target về trạng thái dữ liệu mẫu ban đầu.

### 2.4. Lab Manager Control Plane API (`src/lab/`)
- `src/lab/registry.js`: Quản lý nạp manifest, schema validation, scope check.
- `src/lab/lifecycle.js`: State machine quản lý start, stop, reset, health probe.
- `src/lab/testEngine.js`: Điều phối scan, tạo evidence có mã băm SHA-256, tính toán ma trận độ chính xác.
- `src/lab/server.js`: Cung cấp các endpoint REST API:
  - `GET /api/targets`
  - `GET /api/targets/:id`
  - `POST /api/targets/:id/start`
  - `POST /api/targets/:id/stop`
  - `POST /api/targets/:id/reset`
  - `POST /api/test-runs`
  - `GET /api/test-runs/:id`
  - `GET /api/findings`
  - `GET /api/reports/:id`
  - `GET /api/health`

---

## 3. Công thức đánh giá Scanner (Section 8)
Nền tảng tự động tính toán Precision và Recall dựa trên Ground Truth của target:

$$\text{Recall} = \frac{TP}{TP + FN}$$

$$\text{Precision} = \frac{TP}{TP + FP}$$

Trong đó:
- **TP (True Positives)**: Phát hiện đúng lỗ hổng thực tế có trong manifest.
- **FP (False Positives)**: Cảnh báo sai về lỗ hổng không tồn tại.
- **FN (False Negatives)**: Bỏ sót lỗ hổng có trong target.

---

## 4. Hướng dẫn chạy và kiểm thử

### Chạy toàn bộ test suites (FairEnrol Cryptographic Invariants + Lab Platform Tests):
```powershell
npm run test:all
```

### Chỉ chạy kiểm thử Lab Platform:
```powershell
npm run test:lab
```

### Khởi động Lab Manager Control Plane:
```powershell
npm run lab:server
```

### Khởi động container lab (khi có Docker):
```powershell
docker compose -f deploy/compose/lab-platform.yaml up -d
```
