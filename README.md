# Banking Migration Lab — old system vs new system (baseline so sánh)

Hai hệ thống **độc lập**, chạy trên hai host/port riêng, cùng chung một API contract —
giống hệt cách một cuộc di trú thật diễn ra (old prod ≠ new prod là hai deployment tách biệt):

| | Hệ thống | DB | Cổng | Base URL |
|---|---|---|---|---|
| **OLD** | SQL Server (dữ liệu đúng — baseline) | `old-system/data.db` | 3001 | `http://localhost:3001/api/v1` |
| **NEW** | GaussDB (đã di trú — cài lỗi) | `new-system/data.db` | 3002 | `http://localhost:3002/api/v1` |

Test harness chỉ việc trỏ vào 2 base URL và **so sánh (reconciliation)**.

## Chạy

```bash
npm install
npm run build         # dựng old-system/data.db (truth) rồi migrate sang new-system/data.db (kèm lỗi)
npm start             # chạy CẢ 2 server (concurrently): OLD:3001, NEW:3002
# hoặc 2 terminal:  npm run start:old   |   npm run start:new

npm run reconcile     # baseline comparison: diff OLD vs NEW theo từng field -> báo cáo + report.json
npm test              # test parity chức năng (lỗi hành vi mà recon không thấy)
npm run reset         # xoá & build lại (deterministic)
```

## Hai tầng phát hiện lỗi — dùng cả hai

1. **`npm run reconcile`** — công cụ **diff dữ liệu** OLD↔NEW, căn theo primary key, so từng field,
   phân loại (datetime / money / unicode / null_lost / type_drift / key-case) và đếm.
   Bắt các lỗi **dữ liệu tĩnh**: BUG-01, 02, 03, 04, 05a. Trả exit code 1 nếu lệch → cắm thẳng vào CI.

2. **`npm test`** — test **chức năng** trỏ vào 2 host. Bắt các lỗi **hành vi** mà diff dữ liệu KHÔNG thấy:
   BUG-05b (case-sensitive lookup), BUG-05c (collation sort), BUG-06 (sequence).

> Vì sao tách: reconcile so *dữ liệu ở trạng thái nghỉ*; nhưng nhiều lỗi migration chỉ lộ khi *gọi API*
> (tra cứu, sắp xếp, ghi mới). Migration testing thật cần cả hai góc.

## Endpoint (giống nhau ở cả 2 hệ thống)

`GET /users?sort=&limit=&offset=` · `GET /users/:id` · `GET /users/by-email?email=` ·
`GET /users/:id/{accounts|devices|notifications}` · `GET /accounts/:id` · `POST /accounts` ·
`GET /accounts` · `GET /devices` · `GET /notifications` · `GET /health`

## Cấu trúc

```
shared/generate.js    sinh dữ liệu chuẩn (deterministic)
shared/bugs.js        các phép biến đổi cài lỗi (dùng khi build new-system)
shared/makeRoutes.js  router dùng chung -> khác biệt nằm ở repo, không phải route
old-system/           build.js (truth) · repo.js (sạch) · server.js  :3001
new-system/           build.js (migrate+lỗi) · repo.js (quirk GaussDB) · server.js  :3002
harness/reconcile.mjs baseline comparison (oracle)
harness/parity.test.mjs  test parity chức năng
```

> Danh mục lỗi + kết quả kỳ vọng đầy đủ: **BUGS.md** (spoiler).
> `reconcile.mjs` chính là "oracle" — nếu muốn tự luyện viết test tìm lỗi, đừng đọc report vội.
