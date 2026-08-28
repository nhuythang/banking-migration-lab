// generate.js
// Sinh dữ liệu "đúng" đại diện cho nguồn SQL Server (source of truth).
// Deterministic (seeded RNG) => mỗi lần build ra cùng dữ liệu, lỗi tái lập được.

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20260828);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;

// Họ + tên đệm + tên, nhiều dấu tiếng Việt để test Unicode/collation
const HO = ["Nguyễn", "Trần", "Lê", "Phạm", "Huỳnh", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương"];
const DEM = ["Thị", "Văn", "Hữu", "Đức", "Thanh", "Quốc", "Minh", "Ngọc", "Xuân", "Bảo"];
const TEN = ["Anh", "Dũng", "Hà", "Hương", "Khánh", "Linh", "Nhật", "Phúc", "Quỳnh", "Trí", "Uyên", "Vỹ", "Ánh", "Đạt"];

// Định dạng datetime chuẩn SQL Server: 'YYYY-MM-DD HH:mm:ss.SSS', giờ local +07 (HCMC)
function ts(daysAgo, ms = true) {
  const base = Date.UTC(2026, 7, 28, 3, 0, 0); // 2026-08-28 10:00 +07
  const d = new Date(base - daysAgo * 86400000 - int(0, 86399) * 1000 - (ms ? int(0, 999) : 0));
  const p = (n, w = 2) => String(n).padStart(w, "0");
  const s = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
            `${p(d.getUTCHours() + 7)}`.slice(0, 2) + `:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  // build lại cho đúng +07 (tránh lệch khi giờ >=24)
  const local = new Date(d.getTime() + 7 * 3600000);
  const out = `${local.getUTCFullYear()}-${p(local.getUTCMonth() + 1)}-${p(local.getUTCDate())} ` +
              `${p(local.getUTCHours())}:${p(local.getUTCMinutes())}:${p(local.getUTCSeconds())}`;
  return ms ? `${out}.${p(int(0, 999), 3)}` : `${out}.000`;
}

function genUsers(n) {
  const users = [];
  for (let i = 1; i <= n; i++) {
    const fullName = `${pick(HO)} ${pick(DEM)} ${pick(TEN)}`;
    // email trộn HOA/thường có chủ đích -> test case-sensitivity
    const localPart = `user${i}${rnd() < 0.3 ? ".VIP" : ""}`;
    const email = `${localPart}@bankdemo.vn`;
    users.push({
      id: i,
      full_name: fullName,
      email,
      phone: `09${int(10000000, 99999999)}`,
      // bit: đa số 1, một ít 0, và CÓ CHỦ ĐÍCH để NULL (chưa xác thực) -> test bit/NULL
      is_active: rnd() < 0.1 ? null : (rnd() < 0.85 ? 1 : 0),
      created_at: ts(int(30, 400)),
      last_login: rnd() < 0.15 ? null : ts(int(0, 29)),
    });
  }
  return users;
}

function genAccounts(users) {
  const accounts = [];
  let id = 1;
  const ccy = ["VND", "USD", "EUR"];
  for (const u of users) {
    const num = int(1, 2);
    for (let k = 0; k < num; k++) {
      // money SQL Server: 4 chữ số thập phân. Cố tình có số lẻ tới 4 chữ số -> test precision
      const whole = int(0, 500000000);
      const frac = int(0, 9999); // .0000 - .9999
      const balance = Number(`${whole}.${String(frac).padStart(4, "0")}`);
      accounts.push({
        id: id++,
        user_id: u.id,
        account_no: String(190000000000 + id * 7 + int(0, 6)),
        currency: pick(ccy),
        balance, // sẽ ghi as-is 4 chữ số
        is_primary: k === 0 ? 1 : 0,
        created_at: ts(int(10, 380)),
      });
    }
  }
  return accounts;
}

function genDevices(users) {
  const devices = [];
  let id = 1;
  const models = ["iPhone 15 Pro", "Samsung Galaxy S24", "Xiaomi 14", "OPPO Reno11", "iPhone 13"];
  const os = ["iOS 18.1", "Android 15", "Android 14", "iOS 17.5"];
  for (const u of users) {
    const num = int(1, 3);
    for (let k = 0; k < num; k++) {
      devices.push({
        id: id++,
        user_id: u.id,
        // tên thiết bị người dùng đặt, có dấu tiếng Việt -> test Unicode
        device_name: rnd() < 0.5 ? `Điện thoại của ${pick(TEN)}` : pick(models),
        model: pick(models),
        os_version: pick(os),
        // bit: trusted, có NULL (chưa đánh giá)
        is_trusted: rnd() < 0.12 ? null : (rnd() < 0.6 ? 1 : 0),
        last_seen: rnd() < 0.1 ? null : ts(int(0, 60)),
      });
    }
  }
  return devices;
}

function genNotifications(users) {
  const notifs = [];
  let id = 1;
  const templates = [
    (a) => `Tài khoản của bạn vừa nhận ${a}₫. Số dư khả dụng đã được cập nhật.`,
    (a) => `Giao dịch chuyển khoản ${a}₫ đã thực hiện thành công.`,
    () => `Cảnh báo: Phát hiện đăng nhập từ thiết bị lạ. Vui lòng kiểm tra.`,
    () => `Mã OTP của bạn sắp hết hạn. Xác thực để tiếp tục giao dịch.`,
    () => `Chương trình ưu đãi hoàn tiền tháng 8 dành cho khách hàng thân thiết.`,
  ];
  for (const u of users) {
    const num = int(0, 5);
    for (let k = 0; k < num; k++) {
      const amt = int(10000, 50000000).toLocaleString("vi-VN");
      notifs.push({
        id: id++,
        user_id: u.id,
        title: pick(["Biến động số dư", "Cảnh báo bảo mật", "Ưu đãi", "Xác thực giao dịch"]),
        content: pick(templates)(amt),
        // bit is_read: có NULL (chưa gửi tới thiết bị) -> test bit/NULL
        is_read: rnd() < 0.15 ? null : (rnd() < 0.5 ? 1 : 0),
        created_at: ts(int(0, 90)),
      });
    }
  }
  return notifs;
}

function generateAll() {
  const users = genUsers(40);
  return {
    users,
    accounts: genAccounts(users),
    devices: genDevices(users),
    notifications: genNotifications(users),
  };
}

module.exports = { generateAll };
