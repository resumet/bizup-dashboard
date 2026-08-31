import { readSheet } from "read-excel-file/node";

import {
  analyzePurchaseOrders,
  parsePurchaseOrderRows,
} from "../src/lib/purchases/analysis";

const filePath = process.argv[2];
if (!filePath) throw new Error("검증할 XLSX 파일 경로를 입력해 주세요.");

async function main() {
  const matrix = await readSheet(filePath, "주문결제 목록");
  const rows = parsePurchaseOrderRows(matrix as unknown[][]);
  const analysis = analyzePurchaseOrders(rows);

  console.log(JSON.stringify({
    rows: rows.length,
    totals: analysis.totals,
    courses: analysis.courses,
    statuses: analysis.statuses,
    paymentMethods: analysis.paymentMethods,
    repeatCustomers: analysis.repeatCustomers.length,
  }, null, 2));
}

void main();
