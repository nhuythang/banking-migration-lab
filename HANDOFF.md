# HANDOFF.md — bàn giao để tiếp tục trong Claude Code

Tài liệu này để một phiên Claude Code đọc và nối tiếp công việc. Đọc cùng `README.md` (cách chạy)
và `BUGS.md` (đáp án lỗi). Toàn bộ đã chạy & verify trong quá trình dựng; phần "Đã verify" bên dưới
để KHÔNG phải làm lại.

## 1. Mục tiêu

Bộ lab luyện **API migration testing** cho tình huống **SQL Server → GaussDB** (mobile banking).
Hai hệ thống độc lập cùng một API contract, cài sẵn lỗi migration điển hình, kèm công cụ so sánh baseline.

- Domain: user accounts, bank accounts, devices, notifications (dữ liệu ngân hàng **giả**).
- Stack: Node.js + Express + better-sqlite3 (SQLite mô phỏng hành vi 2 DB).
- Dữ liệu **deterministic** (seed cố định trong `shared/generate.js`) → lỗi tái lập y hệt mỗi lần build.

## 2. Kiến trúc

| | Hệ thống | Vai trò | DB | Cổng |
|---|---|---|---|---|
| OLD | SQL Server | baseline (đúng) | `old-system/data.db` | 3001 |
| NEW | GaussDB | đã di trú (có lỗi) | `new-system/data.db` | 3002 |

- NEW được build bằng cách **migrate từ `old-system/data.db`** (mô phỏng đọc từ prod cũ) → NEW = OLD + lỗi.
- `deploy/gateway.js` gộp cả hai về **một process/URL** (`/old/api/v1`, `/new/api/v1`) cho mục đích deploy public.

### File map
```
shared/generate.js     sinh dữ liệu chuẩn (deterministic; sửa số lượng/RNG ở đây)
shared/bugs.js         phép biến đổi cài lỗi data-level (mojibake, shiftTz, moneyLoss, bitCoalesce)
shared/makeRoutes.js   router dùng chung — KHÁC BIỆT hành vi nằm ở repo, KHÔNG ở route
old-system/build.js    -> old-system/data.db (PascalCase schema, dữ liệu đúng)
old-system/repo.js     hành vi SQL Server: case-insensitive email, sort tiếng Việt, identity đúng
old-system/server.js   :3001
new-system/build.js    migrate OLD -> new-system/data.db (lowercase schema + lỗi data-level)
new-system/repo.js     quirk GaussDB: bit->boolean, case-sensitive, byte-order sort, sequence lệch
new-system/server.js   :3002
harness/reconcile.mjs  diff dữ liệu OLD↔NEW theo field, phân loại, exit 1 nếu lệch (oracle/CI)
harness/parity.test.mjs test chức năng (node --test) cho lỗi hành vi
deploy/gateway.js      1 process mount /old + /new + landing page (dùng PORT env)
deploy/DEPLOY.md       hướng dẫn deploy (Cloudflare tunnel / Render / Railway / Fly)
Dockerfile, render.yaml, .dockerignore, .gitignore
package.json, README.md, BUGS.md
```

## 3. Chạy

```bash
npm install
npm run build          # dựng cả 2 DB (deterministic)
npm start              # 2 server: OLD:3001, NEW:3002 (concurrently)
npm run reconcile      # baseline diff -> console + harness/report.json, exit 1 nếu lệch
npm test               # parity tests (cần 2 server đang chạy)
npm run start:gateway  # 1 URL cho deploy public (PORT env, mặc định 8080)
npm run reset          # xoá & build lại
```

## 4. Danh mục lỗi (8 lỗi / 4 nhóm) — chi tiết ở BUGS.md

| ID | Nhóm | Tầng | Nơi cài |
|---|---|---|---|
| BUG-01 | Unicode tiếng Việt (mojibake/`?`) | data | `shared/bugs.js:corruptViet` (áp trong `new-system/build.js`) |
| BUG-02 | datetime lệch -7h + mất mili-giây | data | `shared/bugs.js:shiftTz` |
| BUG-03 | money 4dp → 2dp (mất precision) | data | `shared/bugs.js:moneyLoss` |
| BUG-04a | bit NULL → 0 (mất "unknown") | data | `shared/bugs.js:bitCoalesce` |
| BUG-04b | bit 0/1 → boolean true/false (đổi contract) | runtime | `new-system/repo.js:castBits` |
| BUG-05a | identifier fold về chữ thường | schema | `new-system/build.js` (schema lowercase) |
| BUG-05b | tra cứu chuỗi case-sensitive | runtime | `new-system/repo.js:findUserByEmail` |
| BUG-05c | collation sort sai tiếng Việt | runtime | `new-system/repo.js:listUsers(sort=name)` |
| BUG-06 | sequence không set = max+1 → duplicate key | runtime | `new-system/repo.js:createAccount` (biến `seq=50`) |

**Nguyên tắc quan trọng**: reconcile (diff dữ liệu tĩnh) bắt BUG-01,02,03,04a,05a.
Các lỗi HÀNH VI (05b, 05c, 06 và biểu diễn 04b) chỉ lộ khi **gọi API** → thuộc `parity.test.mjs`.
Đừng gộp hai loại vào một chỗ.

## 5. Đã verify (KHÔNG cần làm lại)

- `npm run build`: OLD & NEW đều 40 users / 64 accounts / 81 devices / 113 notifications.
- 4 lỗi data-level hiện đúng qua HTTP (mojibake, -7h+mất ms, 373590484.8168→.82, NULL→false).
- 3 lỗi runtime hiện đúng: email chữ thường OLD 200 / NEW 404; sort khác thứ tự; POST OLD 201 / NEW 409 duplicate key.
- `npm run reconcile`: **500 field sai lệch**, phân loại đúng, exit code 1.
- `parity.test.mjs`: 5/5 test fail đúng thiết kế (nghĩa là chúng bắt được lỗi).
- Gateway: `/old` + `/new` serve đúng; reconcile qua prefix vẫn ra 500.
- Đường production của Dockerfile (`npm install --omit=dev` → `npm run build` → gateway) chạy sạch trong thư mục trống (better-sqlite3 cài gọn).

## 6. Rủi ro / giới hạn cần biết

- **SQLite mô phỏng**, không phải GaussDB thật. Các quirk chính xác về mặt PostgreSQL-family nhưng KHÔNG kiểm được lỗi tầng driver/wire, kiểu dữ liệu riêng của GaussDB, hay hành vi transaction/isolation thật.
- **Docker image chưa build thực tế** (sandbox không có Docker) — chỉ mới validate chuỗi lệnh tương đương. Cần `docker build` thật trước khi tin tưởng deploy.
- Reconcile hiện kéo dữ liệu qua **API list-endpoint** → không hợp dataset lớn (triệu dòng). Cần chuyển sang so **checksum/batch** nếu scale.
- DB trên container là **ephemeral** — `POST /accounts` ghi được nhưng reset khi restart.
- Một số lỗi cài **theo tỉ lệ** (mojibake ~1/3, bit-NULL số ít) → test chỉ chọn 1 record "may mắn" sẽ pass giả. Test phải quét toàn dataset.

## 7. Nhánh việc còn mở (chọn khi tiếp tục)

1. **Đổi NEW sang Postgres thật** (gần openGauss nhất) thay SQLite → sát GaussDB hơn; cập nhật `new-system/repo.js` + build.
2. **Toggle bật/tắt từng lỗi** (env/flag) để verify mỗi test bắt đúng một lỗi.
3. **Reconcile checksum-based** cho dataset lớn (hash theo batch, so trước rồi mới diff chi tiết).
4. **Bộ parity đầy đủ theo stack Playwright/Java** của team (thay/bổ sung cho `parity.test.mjs` Node) — có sẵn skill `playwright-java-automation`.
5. Deploy: thêm **basic-auth** cho URL public; thêm `fly.toml`; hoặc **GitHub Actions** tự deploy khi push.
6. Mở rộng nhóm lỗi: FK/orphan sau migrate, phân trang TOP vs LIMIT, NULL ordering, timezone-aware vs naive, `varchar` độ dài byte vs ký tự.

## 8. Quy ước khi thêm lỗi mới

- Lỗi **data-level** → thêm helper vào `shared/bugs.js`, áp trong `new-system/build.js`, rồi rebuild.
- Lỗi **hành vi** → sửa `new-system/repo.js` (OLD giữ đúng làm baseline).
- Cập nhật `BUGS.md` (đáp án) + thêm case vào `harness/parity.test.mjs` hoặc để `reconcile.mjs` tự bắt nếu là data-level.
- Giữ `shared/generate.js` deterministic; nếu đổi seed/số lượng, chạy lại toàn bộ verify ở mục 5.
