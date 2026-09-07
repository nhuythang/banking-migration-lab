// harness/exercise.mjs
// Bộ bài tập tự chấm cho người luyện tập.
//
// Bạn tự đi tìm sai lệch OLD vs NEW (theo docs/worksheet.md), ghi vào
// harness/my-findings.json, rồi chạy:
//
//   npm run exercise                 # chấm điểm, KHÔNG lộ đáp án còn thiếu
//   npm run exercise -- --reveal     # lộ các checkpoint bạn bỏ sót + cách xem
//   npm run exercise -- --verify https://banking-migration-lab.onrender.com
//                                    # gọi thật 2 hệ thống, xác nhận từng phát hiện là có thật
//
// Nguồn chân lý:
//   - 5 lỗi dữ liệu tĩnh  -> suy ra từ harness/expected.json (đã chốt)
//   - 4 lỗi hành vi        -> key nhúng bên dưới (reconcile không thấy được)
//
// KHÔNG cần server để chấm (trừ khi dùng --verify). KHÔNG cần mở BUGS.md.

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const REVEAL = args.includes("--reveal");
const vi = args.indexOf("--verify");
const VERIFY_BASE = vi >= 0 ? args[vi + 1]?.replace(/\/+$/, "") : null;

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));

// ── helpers dùng chung ───────────────────────────────────────────────
const lc = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v]));
const isTs = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s);
const numish = (v) => v !== null && v !== "" && !isNaN(Number(v));
const mojibake = (s) => typeof s === "string" && /[ÃÂ]|â€|�/.test(s);
const api = (base, sys, path) => fetch(`${base}/${sys}/api/v1${path}`);
const jget = (base, sys, path) => api(base, sys, path).then((r) => r.json());
const jpair = (base, path) => Promise.all([jget(base, "old", path), jget(base, "new", path)]);

// ── Nhóm lỗi + nhãn ─────────────────────────────────────────────────
const GROUP_LABEL = {
  "BUG-01": "Unicode tiếng Việt hỏng (mojibake / mất dấu)",
  "BUG-02": "Datetime lệch timezone + mất mili-giây",
  "BUG-03": "Mất độ chính xác tiền (4dp → 2dp)",
  "BUG-04a": "bit NULL bị nuốt thành false",
  "BUG-04b": "bit 0/1 đổi thành boolean true/false (đổi contract)",
  "BUG-05a": "Tên cột/khoá JSON bị fold về chữ thường",
  "BUG-05b": "Tra cứu chuỗi phân biệt HOA/thường (email → 404)",
  "BUG-05c": "Sắp xếp tiếng Việt sai (ORDER BY collation)",
  "BUG-06": "Sequence không reset sau bulk load → POST trùng khoá",
};

// category chuẩn -> nhóm  (dùng cho 5 lỗi dữ liệu tĩnh, suy từ expected.json)
const DATA_CAT_GROUP = {
  unicode: "BUG-01",
  datetime: "BUG-02",
  "number/money": "BUG-03",
  null_lost: "BUG-04a",
  "schema-keycase": "BUG-05a",
};

// 4 lỗi hành vi — reconcile / expected.json KHÔNG chứa
const BEHAVIOR = [
  {
    id: "boolean-type", group: "BUG-04b",
    hint: "So KIỂU chứ không so giá trị: GET /old/api/v1/users/3 → IsActive:1 (number); NEW → isactive:true (boolean).",
    verify: async (b) => {
      const [o, n] = await jpair(b, "/users/3");
      return typeof o.IsActive === "number" && typeof lc(n).isactive === "boolean";
    },
  },
  {
    id: "case-sensitivity", group: "BUG-05b",
    hint: "GET /users/by-email?email=user2.vip@bankdemo.vn → OLD 200, NEW 404 (email lưu là user2.VIP@...).",
    verify: async (b) => {
      const q = "/users/by-email?email=user2.vip@bankdemo.vn";
      const [os, ns] = await Promise.all([api(b, "old", q).then((r) => r.status), api(b, "new", q).then((r) => r.status)]);
      return os === 200 && ns === 404;
    },
  },
  {
    id: "collation", group: "BUG-05c",
    hint: "GET /users?sort=name&limit=6 hai bên → thứ tự id KHÁC nhau.",
    verify: async (b) => {
      const ids = async (sys) => (await jget(b, sys, "/users?sort=name&limit=1000")).map((u) => u.UserId ?? u.userid);
      return JSON.stringify(await ids("old")) !== JSON.stringify(await ids("new"));
    },
  },
  {
    id: "sequence", group: "BUG-06",
    hint: 'POST /accounts {"user_id":1,"currency":"VND","balance":1000} → OLD 201, NEW 409 (lúc DB còn sạch).',
    verify: async (b) => {
      const body = JSON.stringify({ user_id: 1, currency: "VND", balance: 1000 });
      const res = await fetch(`${b}/new/api/v1/accounts`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body,
      });
      return res.status === 409; // chỉ đúng khi NEW chưa bị POST nhiều lần trong phiên
    },
  },
];

// ── Chuẩn hoá category người dùng nhập ──────────────────────────────
function canonCategory(c) {
  if (!c) return null;
  const k = String(c).trim().toLowerCase().replace(/[\s_]+/g, "-");
  const alias = {
    unicode: "unicode", mojibake: "unicode", encoding: "unicode",
    datetime: "datetime", timezone: "datetime", tz: "datetime", date: "datetime",
    money: "number/money", "number-money": "number/money", number: "number/money",
    precision: "number/money", balance: "number/money",
    null: "null_lost", "null-lost": "null_lost", nullable: "null_lost", "bit-null": "null_lost",
    "key-case": "schema-keycase", keycase: "schema-keycase", schema: "schema-keycase",
    "identifier-folding": "schema-keycase",
    "bool-type": "boolean-type", "type-drift": "boolean-type", "contract-drift": "boolean-type",
    "case-sensitive": "case-sensitivity", "email-404": "case-sensitivity",
    "sort-order": "collation", "order-by": "collation", "vietnamese-sort": "collation",
    identity: "sequence", "duplicate-key": "sequence", "post-409": "sequence", autoincrement: "sequence",
  };
  return alias[k] || k;
}
const catGroup = (cat) =>
  DATA_CAT_GROUP[cat] || BEHAVIOR.find((b) => b.id === cat)?.group || null;

// ── Checkpoint thực tế của lab: suy từ expected.json ────────────────
function activeCheckpoints() {
  const expected = load("./expected.json");
  const present = new Set();
  for (const t of expected) {
    if (t.keyCaseDrift?.length) present.add("schema-keycase");
    for (const x of Object.values(t.fields || {})) {
      if (DATA_CAT_GROUP[x.category]) present.add(x.category);
    }
  }
  const data = [...present].map((cat) => ({ id: cat, group: DATA_CAT_GROUP[cat] }));
  const behavior = BEHAVIOR.map(({ id, group, hint }) => ({ id, group, hint }));
  // gợi ý cho phần data-level (cách tự tìm)
  const DATA_HINT = {
    unicode: "So từng field chuỗi (fullname / devicename / content) OLD vs NEW — QUÉT TOÀN BỘ record, đừng tin 1 mẫu.",
    datetime: "So createdat / lastlogin / lastseen: lệch đều ~7h + mất phần .mmm. Định lượng độ lệch, đừng chỉ nói 'khác'.",
    "number/money": "accounts.balance: OLD giữ 4 chữ số thập phân (string), NEW làm tròn 2 (number). Parse rồi mới so.",
    null_lost: "Đếm số record có giá trị null ở cột bit (isactive/istrusted/isread) — NEW ít hơn OLD.",
    "schema-keycase": "So KHOÁ JSON: OLD PascalCase (FullName), NEW lowercase (fullname).",
  };
  for (const d of data) d.hint = DATA_HINT[d.id];
  return [...data, ...behavior].sort((a, b) => a.group.localeCompare(b.group));
}

// ── Đọc bài làm ────────────────────────────────────────────────────
let doc;
try {
  doc = load("./my-findings.json");
} catch {
  console.error(
    "✗ Không đọc được harness/my-findings.json.\n" +
      "  Tạo từ mẫu:  cp harness/my-findings.example.json harness/my-findings.json\n" +
      "  rồi điền các sai lệch bạn tìm được (hướng dẫn: docs/worksheet.md).",
  );
  process.exit(2);
}
const reported = Array.isArray(doc?.findings) ? doc.findings : [];
if (!reported.length) {
  console.error('✗ my-findings.json chưa có mục nào trong mảng "findings".');
  process.exit(2);
}

// ── Chấm ──────────────────────────────────────────────────────────
const CHECKPOINTS = activeCheckpoints();
const cpById = new Map(CHECKPOINTS.map((c) => [c.id, c]));
const hit = new Map();      // checkpointId -> { f, verified }
const rejected = [];        // finding không tính điểm + lý do

for (const f of reported) {
  const cat = canonCategory(f.category);
  const evidence = String(f.evidence ?? f.note ?? "").trim();
  if (!cpById.has(cat)) {
    rejected.push({ f, why: `category "${f.category ?? "(trống)"}" không ứng với lỗi migration nào đã biết` });
    continue;
  }
  if (evidence.length < 8) {
    rejected.push({ f, why: `phân loại [${cat}] ok nhưng thiếu "evidence" — ghi rõ OLD vs NEW bạn quan sát` });
    continue;
  }
  if (!hit.has(cat)) hit.set(cat, { f, verified: null });
}

// ── --verify ─────────────────────────────────────────────────────
if (VERIFY_BASE) {
  console.log(`… xác nhận với ${VERIFY_BASE} (lần đầu có thể chậm 30–50s do Render ngủ)`);
  for (const [id, rec] of hit) {
    try {
      const bh = BEHAVIOR.find((b) => b.id === id);
      rec.verified = bh ? await bh.verify(VERIFY_BASE) : await verifyData(VERIFY_BASE, id);
    } catch (e) {
      rec.verified = null;
      rec.verr = String(e?.message || e);
    }
  }
}

async function verifyData(b, cat) {
  const spec = {
    unicode: { table: "users", path: "/users?limit=10000", pk: "userid", fields: ["fullname"] },
    datetime: { table: "accounts", path: "/accounts", pk: "accountid", fields: ["createdat"] },
    "number/money": { table: "accounts", path: "/accounts", pk: "accountid", fields: ["balance"] },
    null_lost: { table: "notifications", path: "/notifications", pk: "notificationid", fields: ["isread"] },
    "schema-keycase": null,
  }[cat];
  if (cat === "schema-keycase") {
    const [o, n] = await jpair(b, "/users/3");
    return Object.keys(o).includes("FullName") && Object.keys(n).includes("fullname");
  }
  if (!spec) return null;
  const [o, n] = await jpair(b, spec.path);
  const N = new Map(n.map((r) => [lc(r)[spec.pk], lc(r)]));
  for (const orow of o.map(lc)) {
    const nrow = N.get(orow[spec.pk]);
    if (!nrow) continue;
    for (const f of spec.fields) {
      const ov = orow[f], nv = nrow[f];
      if (cat === "datetime" && isTs(ov) && isTs(nv) && ov !== nv) return true;
      if (cat === "number/money" && numish(ov) && numish(nv) && Number(ov).toFixed(4) !== Number(nv).toFixed(4)) return true;
      if (cat === "unicode" && mojibake(nv) && !mojibake(ov)) return true;
      if (cat === "null_lost" && (ov === null) !== (nv === null)) return true;
    }
  }
  return false;
}

// ── In kết quả ───────────────────────────────────────────────────
const TOTAL = CHECKPOINTS.length;                       // 9 biểu hiện
const score = CHECKPOINTS.filter((c) => hit.has(c.id)).length;
const bugNum = (g) => g.replace(/[a-z]$/, "");          // BUG-04a -> BUG-04
const bugNums = [...new Set(CHECKPOINTS.map((c) => bugNum(c.group)))].sort();
const bugNumsHit = [...new Set(CHECKPOINTS.filter((c) => hit.has(c.id)).map((c) => bugNum(c.group)))];
const perfect = score === TOTAL && rejected.length === 0;

console.log("\n═══════════════  KẾT QUẢ  ═══════════════\n");
for (const c of CHECKPOINTS) {
  const rec = hit.get(c.id);
  let mark = "▫️";
  if (rec) mark = rec.verified === true ? "✅✔" : rec.verified === false ? "⚠️" : "✅";
  let note;
  if (rec) {
    note = rec.verified === false
      ? "bạn ghi nhận — nhưng --verify KHÔNG tái lập (kiểm tra lại, hoặc DB đã bị POST làm bẩn)"
      : rec.verified === true ? "tìm thấy + đã xác nhận qua API" : "tìm thấy";
  } else {
    note = REVEAL ? `BỎ SÓT → ${c.hint}` : "chưa ghi nhận";
  }
  console.log(`  ${mark}  [${c.group}] ${GROUP_LABEL[c.group]}`);
  console.log(`       ${note}`);
}

if (rejected.length) {
  console.log("\nKhông tính điểm:");
  for (const r of rejected) console.log(`  • ${r.why}`);
}

console.log("\n───────────────────────────────────────");
console.log(`ĐIỂM: ${score}/${TOTAL} biểu hiện lỗi   ·   nhóm BUG: ${bugNumsHit.length}/${bugNums.length}`);
if (VERIFY_BASE) {
  const ok = [...hit.values()].filter((r) => r.verified === true).length;
  const bad = [...hit.values()].filter((r) => r.verified === false).length;
  console.log(`--verify: xác nhận ${ok}   ·   không tái lập ${bad}`);
}
console.log("───────────────────────────────────────");
if (perfect) {
  console.log("🎉 Đủ cả 9/9. Đối chiếu diễn giải + cách viết assertion: docs/practice-guide.md mục 6.\n");
} else if (REVEAL) {
  console.log("Quay lại docs/worksheet.md cho phần còn thiếu, rồi chạy lại.\n");
} else {
  console.log("Chạy lại với  --reveal  để xem gợi ý phần còn thiếu.\n");
}

process.exit(perfect ? 0 : 1);
