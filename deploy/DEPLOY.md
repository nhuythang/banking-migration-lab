# DEPLOY.md — cho đồng nghiệp truy cập từ internet

Lab gộp thành **một URL công khai** qua gateway: `/old/api/v1` và `/new/api/v1`.
Chọn 1 trong 2 hướng bên dưới.

---

## Cách A — Share TỨC THÌ trong lúc máy bạn đang chạy (không cần deploy, không cần tài khoản)

Nhanh nhất để đồng nghiệp thử ngay trong buổi làm việc. Dùng Cloudflare Quick Tunnel:

```bash
npm install
npm run build
npm run start:gateway            # chạy gateway ở http://localhost:8080

# mở terminal thứ 2:
npx cloudflared tunnel --url http://localhost:8080
```

Cloudflared in ra một URL dạng `https://<ngẫu-nhiên>.trycloudflare.com`.
Gửi URL đó cho đồng nghiệp — họ truy cập:

```
https://<...>.trycloudflare.com/                       (trang hướng dẫn)
https://<...>.trycloudflare.com/old/api/v1/users/3
https://<...>.trycloudflare.com/new/api/v1/users/3
```

- Ưu: 0 cấu hình, 0 tài khoản, URL HTTPS công khai ngay.
- Nhược: chỉ sống khi máy bạn còn chạy; URL đổi mỗi lần bật lại.
- (ngrok cũng được: `ngrok http 8080`, nhưng nay cần đăng ký authtoken.)

---

## Cách B — URL CỐ ĐỊNH, luôn bật (deploy container)

Đã kèm sẵn `Dockerfile` + `render.yaml`. Bạn chỉ cần một tài khoản hosting và một repo Git.

### Bước chung: đẩy code lên GitHub

```bash
git init && git add . && git commit -m "banking migration lab"
git branch -M main
git remote add origin https://github.com/<bạn>/banking-migration-lab.git
git push -u origin main
```
(`node_modules`, `*.db` đã được `.gitignore` — DB sẽ được build lại khi deploy.)

### B1. Render (khuyến nghị — có free tier, đọc sẵn `render.yaml`)

1. Vào https://render.com → **New +** → **Blueprint**.
2. Kết nối GitHub, chọn repo → **Apply**. Render đọc `render.yaml`, build Docker, chạy gateway.
3. Nhận URL `https://banking-migration-lab.onrender.com`. Health check: `/old/health`.

> Free tier **ngủ sau ~15 phút** không có request; request đầu tiên khởi động lại mất vài chục giây.
> Cần luôn-bật tức thì thì nâng lên gói trả phí thấp nhất.

### B2. Railway

1. https://railway.app → **New Project** → **Deploy from GitHub repo** → chọn repo.
2. Railway tự nhận `Dockerfile`. Deploy xong vào **Settings → Networking → Generate Domain** để có URL public.

### B3. Fly.io (CLI)

```bash
fly launch --dockerfile Dockerfile   # nhận cấu hình, tạo app
fly deploy
fly open                             # mở URL public
```

### Không nên dùng Vercel / Netlify cho lab này
Chúng thiên về serverless + filesystem chỉ-đọc. `better-sqlite3` là native module và app có ghi
(`POST /accounts` cho BUG-06), nên container thường (Render/Railway/Fly) hợp hơn nhiều.

---

## Chạy reconcile với hệ thống đã deploy

Từ máy bạn (không cần deploy harness), trỏ vào URL công khai:

```bash
OLD_BASE=https://<host>/old NEW_BASE=https://<host>/new node harness/reconcile.mjs
```

---

## Lưu ý khi để public

- Dữ liệu là **giả**, không có secret — an toàn để mở công khai cho mục đích luyện tập.
- DB chạy trên filesystem tạm của container: `POST /accounts` ghi được nhưng **reset về trạng thái build** mỗi lần khởi động lại. Với môi trường luyện tập chung, đây là điểm cộng (tự làm mới demo lỗi sequence).
- Nếu muốn khoá ghi hoặc thêm mật khẩu cơ bản (basic-auth) cho URL public, báo tôi thêm vào gateway.
