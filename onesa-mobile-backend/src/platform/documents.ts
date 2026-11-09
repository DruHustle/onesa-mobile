import PDFDocument from "pdfkit";
import type { RecordItem } from "./model.ts";

export async function receiptPdf(item: RecordItem): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    info: { Title: "Onesa Mobile test receipt", Author: "Onesa Mobile" },
  });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.fillColor("#103C35").fontSize(25).text("onesa mobile");
  doc
    .moveDown()
    .fillColor("#915E05")
    .fontSize(14)
    .text("LAB TEST RECEIPT — NOT A TAX INVOICE");
  doc
    .fillColor("#172B25")
    .fontSize(11)
    .moveDown()
    .text(
      "No money moved. This document does not purchase or activate a telecom service.",
    );
  const rows = [
    ["Document reference", item.id],
    ["Recorded at", item.createdAt],
    ["Application", item.applicationId],
    ["Test method", item.method],
    ["Reference", item.reference],
    ["Description", item.description],
    ["Recorded amount", `USD ${(Number(item.amountMinor) / 100).toFixed(2)}`],
    ["Test refunds", `USD ${(Number(item.refundedMinor) / 100).toFixed(2)}`],
    ["State", item.state],
  ];
  for (const [label, value] of rows)
    doc
      .moveDown(0.8)
      .font("Helvetica-Bold")
      .text(String(label))
      .font("Helvetica")
      .text(String(value));
  doc
    .moveDown(2)
    .fontSize(10)
    .fillColor("#526A61")
    .text(
      "Generated from a persistent pilot ledger. No payment provider, tax authority, or network operator has confirmed a commercial transaction.",
    );
  doc.end();
  return result;
}
