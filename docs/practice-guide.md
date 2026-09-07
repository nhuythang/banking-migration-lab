# Hướng dẫn luyện tập — Banking Migration Lab

> Dành cho người mới làm **API migration testing**. Đọc từ trên xuống. Phần "Diễn giải lỗi"
> (mục 6) là **spoiler** — nên tự thử mục 5 trước rồi mới đối chiếu.
>
> **Muốn vừa làm vừa được chấm điểm?** Dùng [`worksheet.md`](worksheet.md) — 3 chặng theo độ khó,
> điền bảng, `npm run exercise` tự chấm. Quay lại đây (mục 6) để đối chiếu sau.
>
> Tài liệu liên quan: [`README.md`](../README.md) (cách chạy) · [`BUGS.md`](../BUGS.md) (đáp án gọn) ·
> [`HANDOFF.md`](../HANDOFF.md) (kiến trúc).

---

## 1. Lab này là gì

Một tình huống **di trú cơ sở dữ liệu** mô phỏng: một ngân hàng chuyển hệ thống từ **SQL Server**
sang **GaussDB/openGauss** (nền PostgreSQL). Sau khi migrate, dữ liệu và hành vi API ở hệ thống mới
**sai lệch ở 8 điểm** — đều là các lỗi có thật, hay gặp trong migration.

Có **2 hệ thống chạy song song, cùng một API contract**:

| | Vai trò | Ý nghĩa trong testing |
|---|---|---|
| **OLD** (SQL Server) | Dữ liệu đúng, hành vi đúng | **Oracle** — nguồn chân lý để so sánh |
| **NEW** (GaussDB) | Đã di trú, cài sẵn lỗi | **SUT** (System Under Test) — thứ ta đi tìm lỗi |

Việc của bạn: **gọi cùng một endpoint trên cả hai, so kết quả, và giải thích mọi khác biệt** —
khác biệt nào là "lỗi migration", khác biệt nào chấp nhận được.

---

## 2. Chuẩn bị (5 phút)

### 2.1. URL

Bản deploy công khai (dữ liệu **giả**, không cần đăng nhập):

```
Trang chủ:  https://banking-migration-lab.onrender.com/
OLD base:   https://banking-migration-lab.onrender.com/old
NEW base:   https://banking-migration-lab.onrender.com/new
```

> Render free tier **ngủ sau ~15 phút** không có request. Lần gọi đầu tiên có thể mất **30–50 giây**
> để "thức dậy" — cứ chờ, gọi lại là nhanh. Khi service khởi động lại, dữ liệu **reset về trạng thái
> build gốc** (điểm cộng: lỗi `POST` luôn tái lập).

### 2.2. Chọn công cụ

| Công cụ | Khi nào dùng |
|---|---|
| **Trình duyệt** | Xem nhanh 1 endpoint GET. Mở trang chủ có sẵn link so sánh 2 bên. |
| **Postman** | Luyện nghiêm túc. Có sẵn collection + test scripts. |
| **curl / script** | Tự động hoá, so cả tập dữ liệu. |

### 2.3. Import Postman

1. Postman → **Import** → chọn:
   - `postman/banking-migration-lab.postman_collection.json`
   - `postman/banking-lab.render.postman_environment.json`
2. Góc trên phải chọn environment **"Banking Lab — Render"**.
3. Collection có 4 thư mục:
   - **Health** — kiểm tra 2 hệ thống còn sống.
   - **OLD — SQL Server** / **NEW — GaussDB** — bộ endpoint đầy đủ, mỗi bên một bản.
   - **Bug demos — OLD vs NEW** — từng cặp request minh hoạ 1 lỗi, kèm test script viết sẵn.

### 2.4. "Hello world"

```bash
curl -s https://banking-migration-lab.onrender.com/old/health
curl -s https://banking-migration-lab.onrender.com/new/health
```

Cả hai trả `{"...","status":"ok"}` → sẵn sàng.

---

## 3. Mô hình tư duy

Migration testing **không phải** kiểm tra "API có chạy không". API vẫn trả `200`, JSON vẫn hợp lệ.
Vấn đề là **nội dung bị lệch một cách tinh vi** — và trong ngân hàng, "lệch tinh vi" = mất tiền,
sai lịch sử giao dịch, khách đăng nhập không được.

Ba câu hỏi cho **mỗi field, mỗi record**:

1. **Giá trị** có bằng nhau không? (`373590484.8168` vs `373590484.82`)
2. **Kiểu dữ liệu** có bằng nhau không? (`"1"` string vs `1` number vs `true` boolean)
3. **Sự tồn tại** có bằng nhau không? (`null` vs `false`, có key vs thiếu key)

Và với **hành vi** (không phải dữ liệu tĩnh):

4. Cùng một request, hai bên có **cùng phản hồi** không? (status code, thứ tự, số bản ghi)

Một lỗi migration điển hình chỉ lộ ở **một** trong bốn câu hỏi trên. Bỏ qua câu nào là mù lỗi đó.

---

## 4. Bảng endpoint

Giống hệt nhau ở cả `/old` và `/new`, đều nằm dưới `/api/v1`:

| Method | Path | Trả về |
|---|---|---|
| GET | `/users?sort=&limit=&offset=` | danh sách user (`sort=name` để test collation) |
| GET | `/users/:id` | 1 user |
| GET | `/users/by-email?email=` | tra user theo email |
| GET | `/users/:id/accounts` · `/devices` · `/notifications` | dữ liệu con của 1 user |
| GET | `/accounts` · `/accounts/:id` | tài khoản ngân hàng |
| POST | `/accounts` body `{user_id, currency, balance}` | tạo tài khoản mới |
| GET | `/devices` · `/notifications` | toàn bộ bảng |
| GET | `/health` | trạng thái hệ thống |

---

## 5. Bài tập chính — tự tìm 8 lỗi

**Đừng đọc mục 6 vội.** Thử theo quy trình sau (đây chính là quy trình một QA migration làm thật):

### Bước 1 — So từng cặp record "đầu bảng"

Gọi `GET /old/api/v1/users/3` và `GET /new/api/v1/users/3`, đặt cạnh nhau. Soi **từng field**:

- Tên hiển thị thế nào?
- Tên **key** của JSON có giống nhau không?
- Trường thời gian có giống nhau không? (giờ, phần thập phân giây)
- Trường `IsActive` — kiểu gì, giá trị gì?

Ghi lại mọi khác biệt. Lặp lại với `/accounts/1`, `/users/7`, `/users/19`.

### Bước 2 — Quét cả tập, đừng tin 1 record

Nhiều lỗi chỉ dính **một phần** dữ liệu (ví dụ 1/3 số record). Nếu chỉ xem user 1 thấy "ổn" rồi
kết luận "không lỗi" là **sai**. Lấy `GET /old/api/v1/users` và `GET /new/api/v1/users` (toàn bộ),
so theo `id`, đếm xem **bao nhiêu** record lệch ở mỗi field.

```bash
B=https://banking-migration-lab.onrender.com
diff <(curl -s $B/old/api/v1/users | python3 -m json.tool) \
     <(curl -s $B/new/api/v1/users | python3 -m json.tool) | head -50
```

### Bước 3 — Thử các hành vi, không chỉ dữ liệu

- `GET /users/by-email?email=user2.vip@bankdemo.vn` — hai bên có cùng status không?
- `GET /users?sort=name&limit=6` — thứ tự user có **trùng nhau** không?
- `POST /accounts` với `{"user_id":1,"currency":"VND","balance":1000}` — hai bên có cùng status không?

### Bước 4 — Phân loại

Với mỗi khác biệt, tự hỏi: *nếu đây là hệ thống ngân hàng thật, điều này gây hại gì?* Xếp vào nhóm:
**Unicode / Datetime / Money / Boolean-Null / Schema / Case-sensitivity / Collation / Identity.**

### Bước 5 — Dùng công cụ có sẵn để kiểm chứng

```bash
git clone https://github.com/nhuythang/banking-migration-lab && cd banking-migration-lab
npm install
OLD_BASE=$B/old NEW_BASE=$B/new node harness/reconcile.mjs
```

`reconcile.mjs` là **oracle tự động** — nó in ra bảng phân loại đầy đủ. So với những gì bạn tự tìm
được. (Chi tiết công cụ ở mục 7.)

---

## 6. Diễn giải từng lỗi (SPOILER)

> Mỗi lỗi kèm: **cách thấy** · **OLD vs NEW thực tế** (lấy từ bản Render) · **nguyên nhân gốc** khi
> migrate SQL Server → GaussDB · **vì sao nguy hiểm** · **cách viết assertion đúng** · **cái bẫy**.

Đặt sẵn biến cho các lệnh `curl` bên dưới:

```bash
B=https://banking-migration-lab.onrender.com
```

---

### BUG-01 — Unicode tiếng Việt hỏng (mojibake / mất dấu)

**Cách thấy:** `curl -s $B/old/api/v1/users/3` vs `curl -s $B/new/api/v1/users/3`

| | Giá trị `fullname` |
|---|---|
| OLD | `Lê Ngọc Ánh` |
| NEW | `LÃª Ngá»c Ãnh` |

Và ở record khác kiểu hỏng khác — `users/7`:

| | |
|---|---|
| OLD | `Đỗ Thanh Hà` |
| NEW | `?o?? Thanh Ha?` |

**Nguyên nhân gốc:** cột chuỗi trong SQL Server thường là `NVARCHAR` (UTF-16). Khi bốc sang
GaussDB (UTF-8), nếu pipeline migrate **đọc byte UTF-8 nhưng diễn giải như Latin-1** → mỗi ký tự
có dấu biến thành 2–3 ký tự rác (`ế` → `áº¿`). Trường hợp `?` là do đích dùng encoding/collation
không chứa ký tự tiếng Việt → ký tự bị thay bằng placeholder khi ghi.

**Vì sao nguy hiểm:** tên khách hàng, nội dung thông báo, địa chỉ — hỏng toàn bộ, không tự phục
hồi được. Với ngân hàng đây là lỗi *dữ liệu định danh*.

**Áp dụng lên:** `users.fullname`, `devices.devicename`, `notifications.content`. Chỉ **một phần**
record — theo quy tắc `id % 3 == 0` → mojibake, `id % 7 == 0` → dấu `?`. Khoảng **17/40 users**,
**14/81 devices**, **48/113 notifications**.

**Assertion đúng:**
```
với mỗi id: assert new.fullname === old.fullname   // so nguyên văn, KHÔNG normalize
```

**Cái bẫy:** test user 1, 2 (không chia hết cho 3 hay 7) → thấy tên đúng → kết luận "không lỗi".
Phải **quét toàn bộ** dataset. Đây là bài học lớn nhất của lab.

---

### BUG-02 — Datetime lệch −7 giờ + mất mili-giây

**Cách thấy:** `curl -s $B/old/api/v1/accounts/1` vs `curl -s $B/new/api/v1/accounts/1`

| | `createdat` |
|---|---|
| OLD | `2025-12-03 14:19:05.523` |
| NEW | `2025-12-03 07:19:05` |

Hai sai lệch cùng lúc: **−7 giờ** (14:19 → 07:19) và **mất `.523`**.

**Nguyên nhân gốc:**
- SQL Server lưu `DATETIME` **không kèm offset**. Dữ liệu vốn là giờ Việt Nam (UTC+7) nhưng cột
  không nói điều đó. Khi migrate, pipeline "giả định nguồn là UTC" và ghi vào GaussDB
  `timestamptz` → bị dịch đi 7 tiếng.
- Đích khai báo `timestamp(0)` (0 chữ số thập phân giây) thay vì `timestamp(3)` → phần `.523`
  bị cắt khi ghi.

**Vì sao nguy hiểm:** giao dịch lúc 00:30 ngày 3 bị đẩy về 17:30 ngày 2 — **sai ngày**, sai kỳ sao
kê, sai tính lãi, sai thứ tự sự kiện trong điều tra gian lận.

**Áp dụng lên:** *mọi* cột thời gian (`createdat`, `lastlogin`, `lastseen`), **có hệ thống** (100%
record có giá trị). `null` vẫn giữ `null`.

**Assertion đúng:**
```
chuẩn hoá cả hai về cùng một mốc (ví dụ epoch ms, có tính tz)
assert |old - new| === 0          // không phải 7 giờ
assert phần mili-giây được giữ    // .523 không được biến mất
```

**Cái bẫy:** chỉ so chuỗi "có khác nhau không" thì thấy lỗi nhưng **không phân biệt được** đây là
lệch tz (đều đặn 7h, có thể bù) hay lỗi ngẫu nhiên. Phải định lượng độ lệch.

---

### BUG-03 — Mất độ chính xác tiền + đổi kiểu

**Cách thấy:** `curl -s $B/old/api/v1/accounts/1` vs `.../new/...`

| | `balance` | Kiểu JSON |
|---|---|---|
| OLD | `"373590484.8168"` | **string**, 4 chữ số thập phân |
| NEW | `373590484.82` | **number**, 2 chữ số thập phân |

**Nguyên nhân gốc:** SQL Server `MONEY` có **4** chữ số thập phân. Người migrate ánh xạ sang
`NUMERIC(19,2)` (quen tay theo "tiền = 2 số lẻ") → GaussDB **làm tròn** khi ghi. Đồng thời driver
cũ serialize `MONEY` thành chuỗi để khỏi mất chính xác, driver mới trả `numeric` thành `number`
JS → dính luôn rủi ro **floating-point**.

**Vì sao nguy hiểm:** đây là **mất tiền thật**. `0.8168 → 0.82` là chênh lệch dương/âm ngẫu nhiên
trên **từng** tài khoản; cộng dồn toàn ngân hàng là con số lớn và **không đối soát được** với sổ
cái cũ.

**Áp dụng lên:** `accounts.balance`, **64/64** record (mọi record đều có chữ số thứ 3–4).

**Assertion đúng:**
```
assert Number(old.Balance).toFixed(4) === Number(new.balance).toFixed(4)
// chuẩn hoá kiểu (string↔number) TRƯỚC khi so; so tới 4 chữ số
```

**Cái bẫy:** so trực tiếp `old.Balance === new.balance` luôn fail vì lệch kiểu → dễ nhầm là "chỉ
lỗi kiểu, giá trị ok". Phải parse rồi mới thấy lỗi **giá trị** nằm bên dưới.

---

### BUG-04a — `bit` NULL bị nuốt thành `false`

**Cách thấy:** `curl -s $B/old/api/v1/users/1/notifications` vs `.../new/...`

| | notif id=2, `isread` |
|---|---|
| OLD | `null` (chưa gửi tới thiết bị — trạng thái "chưa biết") |
| NEW | `false` |

`users/19` cũng vậy: `IsActive: null` (OLD) → `isactive: false` (NEW).

**Nguyên nhân gốc:** trong SQL Server `BIT` có **ba** trạng thái: `1`, `0`, `NULL`. Script migrate
viết `COALESCE(IsActive, 0)` "cho an toàn khỏi NULL" → **xoá sạch** thông tin "chưa xác định".

**Vì sao nguy hiểm:** `NULL` = "chưa đánh giá thiết bị này", `false` = "đã đánh giá và KHÔNG tin
tưởng". Gộp hai cái là sai nghiệp vụ bảo mật. `isread = null` (chưa đẩy notification) bị biến
thành `false` (đã đẩy, user chưa đọc) → sai số liệu vận hành.

**Áp dụng lên:** `isactive` (~1/40 user), `istrusted` (~8/81 device), `isread` (~21/113 notif).

**Assertion đúng:**
```
đếm số record có giá trị NULL ở OLD và ở NEW cho từng cột bit
assert countNull(old) === countNull(new)     // NEW sẽ ít hơn
```

**Cái bẫy:** NULL là thiểu số. Chọn vài record ngẫu nhiên gần như chắc chắn không trúng cái NULL →
pass giả. Phải so **phân bố** (đếm), không so từng cái.

---

### BUG-04b — `bit` `0/1` đổi thành boolean `true/false` (đổi contract)

**Cách thấy:** `curl -s $B/old/api/v1/users/3` vs `.../new/...`

| | `IsActive` / `isactive` |
|---|---|
| OLD | `1` (number) |
| NEW | `true` (boolean) |

**Nguyên nhân gốc:** SQL Server `BIT` ra JSON là `0/1`; GaussDB `BOOLEAN` ra JSON là `true/false`.
Về mặt logic tương đương, nhưng **kiểu trong response đã đổi**.

**Vì sao nguy hiểm:** client cũ có thể làm `if (user.IsActive === 1)` hoặc `flags.push(row.IsActive)`
rồi gửi số đi nơi khác. `1 === true` là `false` trong JS → nhánh code chết. Đây là **breaking
change của API contract** mà không ai khai báo.

**Áp dụng lên:** `isactive`, `isprimary`, `istrusted`, `isread` — toàn bộ.

**Assertion đúng:**
```
assert typeof new.isactive === typeof old.IsActive     // sẽ fail: 'boolean' vs 'number'
```

**Cái bẫy:** `reconcile.mjs` hiện **không bắt** lỗi này (nó coi `1 == true` là bằng — xem mục 7).
Đây là ví dụ điển hình cho việc **oracle tự động cũng có điểm mù** — vẫn cần mắt người + test
kiểm kiểu.

---

### BUG-05a — Tên cột/bảng bị fold về chữ thường

**Cách thấy:** so **key** của JSON, không phải giá trị.

| OLD | NEW |
|---|---|
| `{"UserId":3, "FullName":"...", "CreatedAt":"...", "LastLogin":...}` | `{"userid":3, "fullname":"...", "createdat":"...", "lastlogin":...}` |

**Nguyên nhân gốc:** SQL Server giữ nguyên hoa/thường của identifier. PostgreSQL/GaussDB **fold mọi
identifier không đặt trong dấu `"` về chữ thường**. Migrate schema bằng cách chạy lại `CREATE TABLE`
mà không quote → `FullName` thành `fullname`.

**Vì sao nguy hiểm:** client đọc `response.FullName` giờ nhận `undefined`. Toàn bộ app/tích hợp
downstream phải sửa. Rất hay bị bỏ sót vì "dữ liệu vẫn đúng mà".

**Assertion đúng:**
```
assert Object.keys(new_row) khớp contract đã thoả thuận
// hoặc tối thiểu: new_row có đủ các key (case-insensitive) như old_row
```

**Cái bẫy:** nếu test tự viết cũng lowercase hết trước khi so (như `reconcile.mjs` làm để so *giá
trị*) thì mất dấu lỗi này. Phải kiểm **key thô** riêng.

---

### BUG-05b — Tra cứu chuỗi phân biệt HOA/thường

**Cách thấy:**
```bash
curl -s -o /dev/null -w "%{http_code}\n" "$B/old/api/v1/users/by-email?email=user2.vip@bankdemo.vn"
curl -s -o /dev/null -w "%{http_code}\n" "$B/new/api/v1/users/by-email?email=user2.vip@bankdemo.vn"
```

| OLD | NEW |
|---|---|
| `200` (tìm thấy — email lưu là `user2.VIP@bankdemo.vn`) | `404` |

**Nguyên nhân gốc:** collation mặc định của SQL Server là **case-insensitive** (`..._CI_...`), nên
`WHERE Email = @x` khớp bất kể hoa thường. GaussDB mặc định **case-sensitive** (collation `C` hoặc
`en_US.UTF-8`) → `'user2.vip...' = 'user2.VIP...'` là `false`.

**Vì sao nguy hiểm:** khách nhập email thường như mọi khi → **đăng nhập/tra cứu thất bại** sau khi
lên hệ thống mới, dù dữ liệu di trú đủ 100%. Đây là lỗi **chỉ lộ khi gọi API**, không diff dữ liệu
tĩnh nào thấy được.

**Assertion đúng:**
```
tra cùng email (chữ thường) trên 2 hệ thống → phải trả cùng 1 user (cùng id)
```

**Cái bẫy:** nếu seed test dùng email chữ thường sẵn thì không bao giờ thấy. Phải cố tình test
bằng biến thể hoa/thường khác với giá trị lưu.

---

### BUG-05c — Sắp xếp tiếng Việt sai (collation)

**Cách thấy:** `GET /users?sort=name&limit=6` hai bên, so **thứ tự id**.

| OLD (từ điển tiếng Việt) | NEW (byte-order) |
|---|---|
| `30 Bùi Hữu Vỹ` | `7  ?o?? Thanh Ha?` |
| `12 Bùi Minh Phúc` | `30 BÃ¹i Há»¯u Vá»¹` |
| `33 Bùi Ngọc Trí` | `12 BÃ¹i Minh PhÃºc` |
| `8  Bùi Thanh Linh` | `33 BÃ¹i Ngá»c TrÃ­` |
| `15 Bùi Xuân Trí` | `15 BÃ¹i XuÃ¢n TrÃ­` |
| `10 Dương Thị Linh` | `8  Bùi Thanh Linh` |

Thứ tự **khác hẳn**: chuỗi mojibake (bắt đầu bằng byte `0xC3…`) bị đẩy lên trước chuỗi sạch;
trong nhóm sạch, `Xuân` đứng trước `Thanh` vì so theo byte chứ không theo bảng chữ cái.

**Nguyên nhân gốc:** SQL Server `Vietnamese_CI_AS` sắp theo quy tắc từ điển tiếng Việt. GaussDB
collation `C` sắp theo **giá trị byte UTF-8** → dấu và ký tự đặc biệt rơi sai chỗ. (BUG-01 làm
tình hình tệ hơn: chuỗi hỏng sắp theo byte rác.)

**Vì sao nguy hiểm:** mọi màn hình có "sắp theo tên", phân trang theo tên, "khách hàng A–C" đều
sai. Phân trang kiểu keyset dựa trên thứ tự này sẽ **bỏ sót hoặc lặp** bản ghi.

**Assertion đúng:**
```
lấy danh sách id khi sort=name ở 2 hệ thống → assert deepEqual(new_ids, old_ids)
```

**Cái bẫy:** dataset toàn ASCII sẽ không lộ. Phải có dữ liệu dấu tiếng Việt thật trong bộ test.

---

### BUG-06 — Sequence không reset sau bulk load → trùng khoá

**Cách thấy:**
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H 'Content-Type: application/json' \
  -d '{"user_id":1,"currency":"VND","balance":1000}' "$B/old/api/v1/accounts"
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H 'Content-Type: application/json' \
  -d '{"user_id":1,"currency":"VND","balance":1000}' "$B/new/api/v1/accounts"
```

| OLD | NEW |
|---|---|
| `201 Created` (account id = 65) | `409` — `duplicate key value violates unique constraint` |

**Nguyên nhân gốc:** khi bulk-load dữ liệu cũ vào GaussDB, các dòng được chèn **kèm sẵn `accountid`
1..64**. Nhưng `SEQUENCE`/`IDENTITY` của cột không được `setval(max(id))` sau đó → nó vẫn đếm từ
một số thấp. `INSERT` mới lấy id đã tồn tại → vi phạm khoá chính.

**Vì sao nguy hiểm:** hệ thống mới lên production, **mọi lệnh tạo tài khoản/giao dịch mới đều fail**
cho tới khi ai đó phát hiện và chạy `setval`. Là lỗi kinh điển bậc nhất của migration.

**Assertion đúng:**
```
POST /accounts trên NEW phải trả 201, và id trả về > max(accountid) hiện có
```

**Cái bẫy:** trong lab này biến đếm bắt đầu từ 50 còn max thật là 64 → **15 POST đầu tiên** fail,
POST thứ 16 trở đi lại thành công (id ≥ 65). Test chạy lặp trong một phiên có thể "tự lành". Luôn
`npm run reset` hoặc chờ Render ngủ/thức để về trạng thái sạch trước khi test lại.
> Lưu ý: `POST` trên **OLD** ghi thật vào DB chân lý — chạy nhiều lần sẽ làm bẩn baseline cho
> `reconcile` (xuất hiện `thiếu ở NEW: [65, 66…]`). Trên Render nó tự sạch khi restart.

---

## 7. Hai tầng test: `reconcile` vs `parity`

| | `harness/reconcile.mjs` | `harness/parity.test.mjs` |
|---|---|---|
| Kiểu | Diff **dữ liệu ở trạng thái nghỉ** | Test **hành vi khi gọi API** |
| Cách làm | Kéo toàn bộ 4 bảng từ 2 hệ thống, căn theo primary key, so từng field, phân loại | Gọi endpoint cụ thể, so status/thứ tự/kiểu |
| Bắt được | BUG-01, 02, 03, 04a, 05a | BUG-05b, 05c, 06 (+ minh hoạ 01, 03) |
| **Không** bắt | 05b, 05c, 06 (dữ liệu tĩnh giống nhau, chỉ hành vi khác); **và 04b** (coi `1==true`) | các lỗi rải rác cần quét toàn tập |
| Exit code | `1` nếu có bất kỳ lệch nào (luôn `1` với lab này — 500 field lệch) | `node --test` fail (các test cố tình assert OLD==NEW) |

**Vì sao tách:** `reconcile` trả lời *"dữ liệu đã chuyển có khớp không"*; `parity` trả lời *"hệ
thống mới có hành xử như cũ không"*. Migration testing thật cần **cả hai góc** — nhiều lỗi nghiêm
trọng nhất (05b, 06) hoàn toàn vô hình với diff dữ liệu.

**Chạy:**
```bash
npm install
npm run build                 # dựng 2 DB local, deterministic
npm start                     # OLD:3001 + NEW:3002 (giữ terminal này)

# terminal khác:
npm run reconcile             # in bảng phân loại + ghi harness/report.json
npm test                      # parity tests (5/5 fail = đúng thiết kế, nghĩa là chúng BẮT được lỗi)
npm run check                 # so report.json với snapshot expected.json (đây là cổng CI)
```

> **CI:** `.github/workflows/reconcile.yml` chạy tự động mỗi push/PR. Cổng xanh/đỏ là `npm run check`
> — nếu ai sửa `generate.js` / `bugs.js` / `repo.js` làm đổi "bề mặt lỗi" mà quên cập nhật
> `harness/expected.json` thì CI đỏ kèm diff. Chốt snapshot mới: `npm run reconcile && npm run snapshot`.

---

## 8. Đọc báo cáo `reconcile`

Ví dụ một khối output:

```
### USERS  (old=40, new=40)
  ⚠ key-case drift (BUG-05a): UserId, FullName, Email, … → chữ thường
  ✗ createdat        40/40  [datetime]  e.g. pk=1: '2026-01-31 10:51:34.455' → '2026-01-31 03:51:34'
  ✗ lastlogin        36/40  [datetime]  …
  ✗ fullname         17/40  [unicode]   e.g. pk=3: 'Lê Ngọc Ánh' → 'LÃª Ngá»c Ãnh'
  ✗ isactive          1/40  [null_lost] e.g. pk=19: null → false
```

Đọc là:
- `40/40` = số record lệch trên tổng → `createdat` lệch **toàn bộ**, `fullname` chỉ **17**.
- `[datetime]` / `[unicode]` / `[null_lost]` / `[number/money]` = nhóm lỗi đã phân loại.
- `pk=3` = primary key của record ví dụ → gọi thẳng `GET /old/api/v1/users/3` để soi.
- `key-case drift` liệt kê riêng vì so theo **key thô**, không phải giá trị.

Tổng cuối bài: **500 field sai lệch** trên 4 bảng — đó là "bề mặt lỗi" mà `expected.json` chốt lại.

---

## 9. Rút ra — checklist cho migration testing thật

Từ 8 lỗi trên, một bộ test migration tối thiểu phải kiểm:

- [ ] **Encoding:** so nguyên văn mọi cột chuỗi, không normalize. Quét **toàn bộ** record.
- [ ] **Datetime:** chuẩn hoá tz rồi assert lệch = 0; kiểm giữ nguyên độ chính xác giây (ms/µs).
- [ ] **Số/tiền:** so tới đúng số chữ số thập phân của **nguồn**; chuẩn hoá string↔number trước.
- [ ] **Nullable / bit:** so **phân bố NULL** (đếm), không so mẫu; kiểm cả kiểu (`0/1` vs `bool`).
- [ ] **Schema:** so tên key/cột thô theo contract, không lowercase trước khi so.
- [ ] **Case-sensitivity:** tra cứu bằng biến thể hoa/thường khác giá trị lưu.
- [ ] **Collation:** so thứ tự `ORDER BY` trên dữ liệu có dấu/ký tự đặc biệt.
- [ ] **Identity/sequence:** `INSERT` mới sau migrate phải thành công, id không đụng dữ liệu cũ.
- [ ] **Toàn tập, không lấy mẫu:** mọi lỗi rải rác chỉ lộ khi quét hết.
- [ ] **Cả hai tầng:** diff dữ liệu tĩnh **và** test hành vi qua API.
- [ ] **Oracle cũng sai được:** dành thời gian review thủ công, đừng tin 100% công cụ (xem BUG-04b).

---

## 10. Tự kiểm tra

1. Vì sao test chỉ xem `users/1` và `users/2` sẽ bỏ sót BUG-01?
2. BUG-02 lệch đúng 7 giờ đều đặn — có nên coi là "bù được, không phải lỗi" không? Vì sao?
3. Về lý thuyết, một account có `balance` kết thúc bằng `.XX00` (hai chữ số thập phân cuối là 0) thì
   `reconcile` có tính nó là lệch không? Vì sao? *(Gợi ý: `Number(...).toFixed(4)` hai bên.)*
4. Nếu **chỉ** cài đúng một lỗi, lỗi nào sẽ khiến `reconcile` vẫn báo "✓ khớp" (exit 0)? Có mấy lỗi
   như vậy trong 8 lỗi?
5. Nếu GaussDB được cấu hình collation `Vietnamese` và bọc identifier trong `"..."` khi migrate,
   những BUG nào biến mất?
6. `POST /accounts` trên NEW lần thứ 20 trả `201`. Có phải BUG-06 đã được sửa không?

> Đáp án đối chiếu: [`BUGS.md`](../BUGS.md) và mục 6 ở trên.
