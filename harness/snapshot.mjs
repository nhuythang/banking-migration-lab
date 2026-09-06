// harness/snapshot.mjs
// Ghi harness/expected.json từ harness/report.json hiện tại (bỏ trường `samples`).
// Dùng khi bạn CỐ Ý đổi bề mặt lỗi (generate.js / bugs.js / repo.js) và muốn chốt snapshot mới.
//
//   npm run reconcile        # sinh report.json (cần 2 server đang chạy)
//   node harness/snapshot.mjs
//   git add harness/expected.json && git commit

import { readFileSync, writeFileSync } from "node:fs";

const report = JSON.parse(readFileSync(new URL("./report.json", import.meta.url)));

const snapshot = report.map((r) => ({
  table: r.table,
  oldCount: r.oldCount,
  newCount: r.newCount,
  missingInNew: r.missingInNew,
  extraInNew: r.extraInNew,
  keyCaseDrift: r.keyCaseDrift,
  fields: Object.fromEntries(
    Object.entries(r.fields).map(([f, x]) => [f, { count: x.count, category: x.category }]),
  ),
}));

writeFileSync(new URL("./expected.json", import.meta.url), JSON.stringify(snapshot, null, 2) + "\n");
console.log(`✓ Ghi harness/expected.json (${snapshot.length} bảng).`);
