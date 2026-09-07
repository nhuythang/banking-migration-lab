# Worksheet — tự tìm 8 lỗi migration

> **Bản để LÀM** (đi kèm [`practice-guide.md`](practice-guide.md) là bản để *đọc*).
> Bạn tự dò sai lệch OLD vs NEW, ghi vào `harness/my-findings.json`, rồi chạy `npm run exercise` để tự chấm.
>
> **Luật chơi:** đừng mở [`BUGS.md`](../BUGS.md) và đừng đọc mục 6 của practice-guide cho tới khi chấm xong.
> Thời lượng: ~45–60 phút. Chia 3 chặng theo độ khó.

---

## 0. Chuẩn bị (2 phút)

```bash
B=https://banking-migration-lab.onrender.com     # hoặc http://localhost:8080 nếu chạy gateway local
curl -s $B/old/health && echo && curl -s $B/new/health && echo
```

> Render free tier ngủ sau ~15 phút — lần gọi đầu chờ 30–50s là bình thường.

Cách ghi phát hiện:

```bash
cp harness/my-findings.example.json harness/my-findings.json
```

Mỗi khi tìm được một khác biệt, thêm một dòng vào mảng `findings`:

```json
{ "category": "datetime", "where": "GET /accounts/1 · createdat", "evidence": "OLD 2025-12-03 14:19:05.523 vs NEW 2025-12-03 07:19:05" }
```

- `category` — chọn từ: `unicode` · `datetime` · `money` · `null` · `schema-keycase` · `boolean-type` · `case-sensitivity` · `collation` · `sequence`
- `evidence` — **bắt buộc**, ≥ 8 ký tự: ghi rõ OLD ra gì, NEW ra gì.

Chấm bất cứ lúc nào: `npm run exercise` (thiếu chỗ nào → `npm run exercise -- --reveal`).

---

## 1. Mô hình tư duy (đọc 1 lần)

API vẫn `200`, JSON vẫn hợp lệ. Lỗi migration nằm ở **nội dung lệch tinh vi**. Với mỗi field, hỏi 4 câu:

| # | Câu hỏi | Ví dụ lệch |
|---|---|---|
| 1 | **Giá trị** bằng nhau? | `373590484.8168` vs `.82` |
| 2 | **Kiểu** bằng nhau? | `1` vs `true`, `"1"` vs `1` |
| 3 | **Sự tồn tại** bằng nhau? | `null` vs `false`; có key vs thiếu key |
| 4 | Cùng request → cùng **hành vi**? | status code, thứ tự, số bản ghi |

Một lỗi thường chỉ lộ ở **một** câu. Bỏ câu nào = mù lỗi đó.

---

## CHẶNG 1 — Nhìn là thấy

> Lệch lộ ngay khi đặt 2 response cạnh nhau. Mục tiêu: làm quen nhịp "gọi đôi, so từng field".

### 1.1 — So một user

```bash
curl -s $B/old/api/v1/users/3 | python3 -m json.tool
curl -s $B/new/api/v1/users/3 | python3 -m json.tool
```

| Field | OLD | NEW | Lệch? loại gì? |
|---|---|---|---|
| `fullname` | | | |
| (tên các **key**) | | | |
| `createdat` | | | |
| `isactive` | | | |

<details><summary>Gợi ý 1</summary>

Nhìn giá trị `fullname` của user 3. Đọc được không? Bây giờ thử user 1 và user 2 — có khác không?
</details>

<details><summary>Gợi ý 2</summary>

user 3 (và 6, 9, 12…) bị hỏng; user 1, 2 thì không. Lỗi **chỉ dính một phần** dataset →
phải quét cả bảng, không kết luận từ 1 mẫu. Ghi `category: "unicode"`.
</details>

### 1.2 — Sắp xếp theo tên

```bash
curl -s "$B/old/api/v1/users?sort=name&limit=6" | python3 -c 'import sys,json;[print(u["UserId"],u["FullName"]) for u in json.load(sys.stdin)]'
curl -s "$B/new/api/v1/users?sort=name&limit=6" | python3 -c 'import sys,json;[print(u["userid"],u["fullname"]) for u in json.load(sys.stdin)]'
```

| Vị trí | OLD (id, tên) | NEW (id, tên) |
|---|---|---|
| 1 | | |
| 2 | | |
| 3 | | |

<details><summary>Gợi ý</summary>

Thứ tự `id` hai bên có trùng không? Chữ tiếng Việt có dấu rơi đúng chỗ trong bảng chữ cái không?
Đây là lỗi **hành vi** (câu hỏi 4) — không diff dữ liệu tĩnh nào thấy. Ghi `category: "collation"`.
</details>

**Xong chặng 1:** chạy `npm run exercise` — nên thấy 2/9.

---

## CHẶNG 2 — Phải đào

> Giá trị *trông* giống nhưng lệch ở phần thập phân, ở timezone, hoặc ở phân bố `null`.
> Mục tiêu: học cách **chuẩn hoá trước khi so** và **so theo phân bố, không theo mẫu**.

### 2.1 — Số dư tài khoản

```bash
curl -s $B/old/api/v1/accounts/1
curl -s $B/new/api/v1/accounts/1
```

| | `balance` — giá trị | `balance` — kiểu JSON |
|---|---|---|
| OLD | | |
| NEW | | |

<details><summary>Gợi ý 1</summary>

Đếm số chữ số sau dấu chấm ở mỗi bên. `string` hay `number`?
</details>

<details><summary>Gợi ý 2</summary>

OLD 4 chữ số thập phân (kiểu string), NEW 2 (kiểu number). `0.8168 → 0.82` là **lệch tiền thật**,
mỗi tài khoản một ít, cộng dồn toàn ngân hàng thì lớn. Assertion đúng:
`Number(old).toFixed(4) === Number(new).toFixed(4)`. Ghi `category: "money"`.
</details>

### 2.2 — Mốc thời gian

Dùng lại response `accounts/1` ở trên, nhìn `createdat` (và thử `GET /users/3` → `lastlogin`).

| Field | OLD | NEW | Lệch bao nhiêu? |
|---|---|---|---|
| `createdat` | | | |

<details><summary>Gợi ý 1</summary>

So giờ: chênh lệch có phải một con số **cố định** không? Còn phần `.523` cuối giây thì sao?
</details>

<details><summary>Gợi ý 2</summary>

Lệch đều **−7 giờ** (giờ VN bị ghi như UTC) **và** mất mili-giây (`timestamp(0)`).
Đừng chỉ ghi "khác" — **định lượng** độ lệch thì mới phân biệt được "lệch tz bù được" với "hỏng ngẫu nhiên".
Ghi `category: "datetime"`.
</details>

### 2.3 — Cờ `bit` và giá trị `null`

```bash
curl -s $B/old/api/v1/users/1/notifications | python3 -c 'import sys,json;[print(n["NotificationId"],n["IsRead"]) for n in json.load(sys.stdin)]'
curl -s $B/new/api/v1/users/1/notifications | python3 -c 'import sys,json;[print(n["notificationid"],n["isread"]) for n in json.load(sys.stdin)]'
```

| notif id | OLD `IsRead` | NEW `isread` |
|---|---|---|
| | | |

<details><summary>Gợi ý 1</summary>

`bit` trong SQL Server có **3** trạng thái: `1`, `0`, `NULL`. Có `null` nào ở OLD biến mất ở NEW không?
`null` là thiểu số — quét cả bảng `GET /notifications`, đếm.
</details>

<details><summary>Gợi ý 2</summary>

`COALESCE(IsRead, 0)` lúc migrate đã xoá trạng thái "chưa biết". `null` = "chưa gửi tới thiết bị",
`false` = "đã gửi, chưa đọc" — gộp là sai nghiệp vụ. So **số lượng null** hai bên, đừng so từng cái.
Ghi `category: "null"`.
</details>

**Xong chặng 2:** `npm run exercise` — nên thấy 5/9.

---

## CHẶNG 3 — Diff dữ liệu không thấy

> 4 lỗi cuối vô hình với việc so giá trị: đổi tên key, đổi kiểu, đổi hành vi tra cứu/ghi.
> Mục tiêu: kiểm **schema** và **hành vi API**, không chỉ **giá trị**.

### 3.1 — Tên key của JSON

Nhìn lại bất kỳ response NEW nào cạnh OLD — lần này so **tên trường**, không so giá trị.

| OLD keys | NEW keys |
|---|---|
| | |

<details><summary>Gợi ý</summary>

`UserId/FullName/CreatedAt` → `userid/fullname/createdat`. Client cũ đọc `res.FullName` giờ nhận `undefined`.
PostgreSQL/GaussDB fold identifier không quote về chữ thường. Ghi `category: "schema-keycase"`.
</details>

### 3.2 — Kiểu của cờ boolean

`GET /users/3` — nhìn `isactive` ở NEW so với `IsActive` ở OLD.

| | giá trị | `typeof` |
|---|---|---|
| OLD | | |
| NEW | | |

<details><summary>Gợi ý</summary>

`1` (number) → `true` (boolean). Logic tương đương nhưng **contract đổi**: `row.IsActive === 1` chết.
Lưu ý: `reconcile.mjs` **không bắt** lỗi này (nó coi `1 == true`). Đây là điểm mù của oracle tự động.
Ghi `category: "boolean-type"`.
</details>

### 3.3 — Tra cứu theo email

```bash
curl -s -o /dev/null -w "OLD %{http_code}\n" "$B/old/api/v1/users/by-email?email=user2.vip@bankdemo.vn"
curl -s -o /dev/null -w "NEW %{http_code}\n" "$B/new/api/v1/users/by-email?email=user2.vip@bankdemo.vn"
```

| | status | trả về user? |
|---|---|---|
| OLD | | |
| NEW | | |

<details><summary>Gợi ý</summary>

Email lưu trong DB là `user2.VIP@...`. SQL Server so chuỗi case-insensitive; GaussDB case-sensitive → NEW `404`.
Khách gõ email thường như mọi khi → đăng nhập fail dù dữ liệu di trú đủ 100%. Ghi `category: "case-sensitivity"`.
</details>

### 3.4 — Tạo tài khoản mới

```bash
curl -s -o /dev/null -w "OLD %{http_code}\n" -X POST -H 'Content-Type: application/json' \
  -d '{"user_id":1,"currency":"VND","balance":1000}' "$B/old/api/v1/accounts"
curl -s -o /dev/null -w "NEW %{http_code}\n" -X POST -H 'Content-Type: application/json' \
  -d '{"user_id":1,"currency":"VND","balance":1000}' "$B/new/api/v1/accounts"
```

| | status |
|---|---|
| OLD | |
| NEW | |

<details><summary>Gợi ý</summary>

NEW `409 duplicate key`: sau bulk-load, `SEQUENCE` của `accountid` không được `setval(max(id))` →
`INSERT` mới đụng id đã tồn tại. Lỗi kinh điển: hệ thống mới lên prod là **mọi lệnh tạo mới đều fail**.
Ghi `category: "sequence"`.
Bẫy: trong lab biến đếm bắt đầu từ 50, max thật là 64 → POST lần 16+ lại `201`. Test trên DB sạch
(Render vừa thức, hoặc `npm run reset`).
</details>

**Xong chặng 3:** `npm run exercise` — mục tiêu **9/9**.

---

## 2. Tự chấm

```bash
npm run exercise                                        # điểm + phần đã ghi nhận
npm run exercise -- --reveal                            # + gợi ý cho phần bỏ sót
npm run exercise -- --verify $B                         # gọi thật 2 hệ thống, xác nhận từng phát hiện
```

- **9/9 biểu hiện** (6/6 nhóm BUG) → xong. Giờ mới mở [`practice-guide.md`](practice-guide.md) mục 6
  để đối chiếu **nguyên nhân gốc** và **cách viết assertion chuẩn** cho từng lỗi.
- Bị "không tính điểm" → đọc lý do: thường là thiếu `evidence` hoặc phân loại chưa đúng nghĩa.

---

## 3. Đối chiếu với công cụ tự động

Bạn vừa làm thủ công thứ mà 2 script trong `harness/` làm tự động:

```bash
npm install && npm run build && npm start      # 2 server local (giữ terminal)
# terminal khác:
npm run reconcile      # diff toàn bộ 4 bảng → bảng phân loại (bắt chặng 1–2 + 3.1)
npm test               # parity: test hành vi (bắt 3.2–3.4)
npm run check          # so bề mặt lỗi với snapshot đã chốt
```

So bảng `reconcile` in ra với những gì bạn tự tìm. Chú ý: `reconcile` **không** liệt kê 3.2 / 3.3 / 3.4 —
đó chính là lý do phải có cả `npm test`. Chi tiết hai tầng: practice-guide mục 7.

---

## 4. Rút ra — checklist migration testing

- [ ] So **nguyên văn** mọi cột chuỗi, **quét toàn bộ** record (không lấy mẫu).
- [ ] Datetime: chuẩn hoá tz → assert lệch = 0; giữ nguyên độ chính xác giây.
- [ ] Số/tiền: so tới đúng số thập phân của **nguồn**; chuẩn hoá `string ↔ number` trước.
- [ ] Nullable/bit: so **phân bố NULL** (đếm); kiểm cả **kiểu** (`0/1` vs `bool`).
- [ ] Schema: so tên key thô theo contract, đừng lowercase trước khi so.
- [ ] Case-sensitivity: tra cứu bằng biến thể hoa/thường **khác** giá trị lưu.
- [ ] Collation: so thứ tự `ORDER BY` trên dữ liệu có dấu.
- [ ] Identity/sequence: `INSERT` mới sau migrate phải `201`, id không đụng dữ liệu cũ.
- [ ] Chạy **cả hai tầng**: diff dữ liệu tĩnh **và** test hành vi API.
- [ ] Oracle tự động cũng có điểm mù (xem 3.2) — vẫn cần mắt người.
