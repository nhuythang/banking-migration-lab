# BUGS.md — Đáp án (SPOILER)

> Chỉ mở file này khi bạn muốn đối chiếu. Danh mục lỗi cài sẵn + cách một test tốt phải bắt được.
> Mỗi lỗi phản ánh một tình huống THẬT khi migrate SQL Server → GaussDB/openGauss (nền PostgreSQL).

## Data-level (nằm trong new-system (`new-system/build.js`) sinh ra)

### BUG-01 — Unicode tiếng Việt hỏng (varchar vs nvarchar / sai encoding)
- **Cơ chế**: cột chuỗi migrate qua với encoding sai → UTF-8 bị đọc như Latin-1 (mojibake), hoặc mất dấu thành `?`.
- **Áp dụng**: `users.fullname`, `devices.devicename`, `notifications.content` — trên **một phần** record (id % 3 → mojibake, id % 7 → `?`).
- **Kỳ vọng vs thực tế**: `Lê Ngọc Ánh` → `LÃª Ngá»c Ãnh`.
- **Test**: so `fullname` legacy vs migrated theo từng `userid`; assert bằng nhau. Cảnh giác: đừng chỉ test 1 record "may mắn" không hỏng.

### BUG-02 — datetime lệch timezone + mất mili-giây
- **Cơ chế**: nguồn lưu giờ local +07; đích lưu như UTC (không mang tz) → **lệch -7h**, đồng thời `timestamp(0)` **mất phần .SSS**.
- **Áp dụng**: mọi cột thời gian (`createdat`, `lastlogin`, `lastseen`) — **có hệ thống**.
- **Kỳ vọng vs thực tế**: `2026-04-03 10:29:53.595` → `2026-04-03 03:29:53`.
- **Test**: so mốc thời gian sau khi chuẩn hoá tz; assert chênh lệch = 0 (không phải 7h) và phần mili-giây được giữ.

### BUG-03 — money mất precision (money(19,4) → numeric(19,2))
- **Cơ chế**: SQL Server `money` 4 chữ số thập phân bị làm tròn còn 2.
- **Áp dụng**: `accounts.balance` — mọi record có chữ số thứ 3–4 khác 0.
- **Kỳ vọng vs thực tế**: `373590484.8168` → `373590484.82` (lệch tiền — nghiêm trọng với ngân hàng).
- **Test**: so `balance` legacy (4dp) vs migrated (2dp); assert khớp tới 4 chữ số. Lưu ý kiểu trả về khác nhau (string vs number) — phải chuẩn hoá trước khi so.

### BUG-04 — bit sai (NULL bị nuốt + biểu diễn đổi)
- **Cơ chế (a)**: `bit` NULL bị `COALESCE(...,0)` nhầm → mất trạng thái "unknown", biến thành `false`.
- **Cơ chế (b)**: `bit` 0/1 (số) ở SQL Server → `boolean` `true/false` ở GaussDB (đổi contract JSON).
- **Áp dụng**: `isactive`, `isprimary`, `istrusted`, `isread`.
- **Kỳ vọng vs thực tế**: `IsActive: null` → `isactive: false`; `IsActive: 1` → `isactive: true`.
- **Test**: (a) đếm số record NULL 2 bên phải bằng nhau — migrated sẽ thiếu; (b) kiểm kiểu dữ liệu field bit trong response.

## Runtime-level (mô phỏng ở `new-system/repo.js` — engine quirk của GaussDB)

### BUG-05a — Identifier folding (tên cột/bảng về chữ thường)
- **Cơ chế**: GaussDB fold identifier không đặt trong `""` về **chữ thường**.
- **Kỳ vọng vs thực tế**: JSON key legacy `FullName/CreatedAt` → migrated `fullname/createdat`.
- **Test**: assert schema/khoá của response khớp contract; client đang đọc `FullName` sẽ nhận `undefined`.

### BUG-05b — Tra cứu chuỗi phân biệt HOA/thường
- **Cơ chế**: SQL Server mặc định case-insensitive; GaussDB **case-sensitive**.
- **Kỳ vọng vs thực tế**: `GET /users/by-email?email=user2.vip@bankdemo.vn` — legacy tìm thấy (email lưu `user2.VIP@...`), migrated **404**.
- **Test**: tra email bằng chữ thường; 2 nhánh phải trả cùng user.

### BUG-05c — Collation sort tiếng Việt sai
- **Cơ chế**: SQL Server `Vietnamese_CI_AS` sắp theo từ điển; GaussDB collation `C`/byte-order.
- **Kỳ vọng vs thực tế**: `?sort=name` cho thứ tự khác nhau (chữ có dấu bị đẩy sai vị trí).
- **Test**: so danh sách `fullname` khi `sort=name`; thứ tự phải trùng.

### BUG-06 — Sequence không set lại sau di trú
- **Cơ chế**: sau bulk load, sequence của `accountid` không được đặt `= max(id)+1` → INSERT mới đụng khoá.
- **Kỳ vọng vs thực tế**: `POST /accounts` — legacy `201` (id = 65), migrated `409 duplicate key`.
- **Test**: tạo account mới trên migrated phải `201` với id > max hiện tại.

## Bản đồ lỗi → yêu cầu luyện tập

| Yêu cầu | Lỗi |
|---|---|
| Kiểu dữ liệu (datetime, bit, money) | BUG-02, BUG-03, BUG-04 |
| Case-sensitivity & collation | BUG-05a, BUG-05b, BUG-05c |
| Identity / sequence | BUG-06 |
| Unicode tiếng Việt | BUG-01 |
