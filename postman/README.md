# Postman — Banking Migration Lab

Gọi cùng một API contract tới **OLD** (SQL Server, baseline) và **NEW** (GaussDB, đã di trú + lỗi).

## Import

1. Postman → **Import** → chọn cả 4 file trong thư mục này.
2. Chọn environment ở góc trên phải:

| Environment | Khi nào dùng | `oldBase` / `newBase` |
|---|---|---|
| **Banking Lab — local gateway** | `npm run start:gateway` (1 process, port 8080) | `http://localhost:8080/old` · `/new` |
| **Banking Lab — local split** | `npm start` (2 server rời) | `http://localhost:3001` · `http://localhost:3002` |
| **Banking Lab — Render** | sau khi deploy | `https://banking-migration-lab.onrender.com/old` · `/new` |

> Sửa host trong file `...render.postman_environment.json` nếu URL Render khác.

## Cấu trúc collection

- **Health** — `{{base}}/health` (khớp `healthCheckPath` của `render.yaml`).
- **OLD** / **NEW** — 12 endpoint giống nhau, chỉ khác base URL.
- **Bug demos — OLD vs NEW** — từng cặp request OLD→NEW; request NEW có sẵn test script assert đúng chỗ lệch (BUG-01…06). Đáp án đầy đủ: [`../BUGS.md`](../BUGS.md).

API nằm dưới `{{base}}/api/v1`; health nằm ở `{{base}}/health`.

## Chạy bằng CLI (newman)

```bash
npx newman run postman/banking-migration-lab.postman_collection.json \
  -e postman/banking-lab.local-gateway.postman_environment.json
```

Đã verify: 38 request / 13 assertion pass với gateway chạy trong Docker.
