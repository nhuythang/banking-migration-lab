// harness/check.mjs
// CI guard: xác nhận "bề mặt lỗi" của lab KHÔNG đổi ngoài ý muốn.
//
// reconcile.mjs luôn exit 1 (lab cố tình có 500 field lệch) nên bản thân nó không
// dùng làm cổng pass/fail được. Script này so harness/report.json (reconcile vừa sinh)
// với harness/expected.json (snapshot đã chốt) — chỉ so phần định lượng, bỏ `samples`.
//
// Exit 0 nếu khớp; exit 1 kèm diff nếu lệch (ai đó sửa generate/bugs/repo mà chưa cập nhật snapshot).
//
// Cập nhật snapshot có chủ đích:
//   npm run build && npm start &   # rồi ở terminal khác:
//   npm run reconcile ; node harness/snapshot.mjs   # (hoặc tự copy report.json -> expected.json, bỏ samples)

import { readFileSync } from "node:fs";

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));

// Chuẩn hoá 1 mảng kết quả reconcile về dạng so sánh được (thứ tự key ổn định, bỏ samples).
function normalize(results) {
  const out = {};
  for (const r of results) {
    out[r.table] = {
      oldCount: r.oldCount,
      newCount: r.newCount,
      missingInNew: [...r.missingInNew].map(String).sort(),
      extraInNew: [...r.extraInNew].map(String).sort(),
      keyCaseDrift: [...r.keyCaseDrift].sort(),
      fields: Object.fromEntries(
        Object.entries(r.fields)
          .map(([f, x]) => [f, { count: x.count, category: x.category }])
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
    };
  }
  return out;
}

let report;
try {
  report = load("./report.json");
} catch {
  console.error("✗ Không đọc được harness/report.json — chạy `npm run reconcile` trước (cần 2 server đang chạy).");
  process.exit(2);
}
const expected = load("./expected.json");

const actual = normalize(report);
const want = normalize(expected);

const diffs = [];
for (const table of new Set([...Object.keys(want), ...Object.keys(actual)])) {
  const a = JSON.stringify(actual[table] ?? null, null, 2);
  const e = JSON.stringify(want[table] ?? null, null, 2);
  if (a !== e) diffs.push(`• ${table}\n  expected:\n${indent(e)}\n  actual:\n${indent(a)}`);
}
function indent(s) {
  return s.split("\n").map((l) => "    " + l).join("\n");
}

const total = report.reduce(
  (n, r) => n + Object.values(r.fields).reduce((m, x) => m + x.count, 0),
  0,
);

if (diffs.length) {
  console.error("✗ Bề mặt lỗi đã THAY ĐỔI so với harness/expected.json:\n");
  console.error(diffs.join("\n\n"));
  console.error(
    "\nNếu thay đổi là CÓ CHỦ ĐÍCH (sửa generate.js / bugs.js / repo.js): " +
      "chạy lại reconcile rồi cập nhật harness/expected.json từ report.json (bỏ trường `samples`).",
  );
  process.exit(1);
}

console.log(`✓ Bề mặt lỗi khớp harness/expected.json — ${total} field sai lệch (đúng thiết kế), 8/8 lỗi hiện diện.`);
