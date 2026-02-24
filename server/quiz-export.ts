import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __mod_dirname = (() => {
  try {
    if (typeof __dirname !== "undefined") return __dirname;
  } catch {}
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {}
  return process.cwd();
})();

import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  Packer,
  ShadingType,
} from "docx";

const RTL_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

function isRtlText(text: string): boolean {
  return RTL_REGEX.test(text);
}

function getLetterForIndex(index: number): string {
  return String.fromCharCode(65 + index);
}

interface QuizQuestion {
  questionText: string;
  options: string[] | null;
  correctAnswer: string;
  type: string;
  points?: number;
}

interface QuizData {
  title: string;
  description?: string | null;
  category?: string | null;
}

function findFontDir(): string {
  const candidates = [
    path.join(process.cwd(), "server", "fonts"),
    path.join(process.cwd(), "dist", "fonts"),
    path.join(process.cwd(), "fonts"),
    path.join(__mod_dirname, "fonts"),
    path.join(__mod_dirname, "..", "server", "fonts"),
    path.join(__mod_dirname, "..", "fonts"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "NotoSans-Regular.ttf"))) {
      console.log(`[Export] Found fonts at: ${dir}`);
      return dir;
    }
  }
  console.log(`[Export] No fonts found, checked: ${candidates.join(", ")}`);
  return candidates[0];
}

const FONT_DIR = findFontDir();
const ARABIC_FONT = path.join(FONT_DIR, "NotoSansArabic-Regular.ttf");
const REGULAR_FONT = path.join(FONT_DIR, "NotoSans-Regular.ttf");

export async function generateQuizPDF(
  quiz: QuizData,
  questions: QuizQuestion[],
  includeAnswers: boolean
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      bufferPages: true,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const hasArabicFont = fs.existsSync(ARABIC_FONT);
    const hasRegularFont = fs.existsSync(REGULAR_FONT);
    if (hasRegularFont) doc.registerFont("NotoSans", REGULAR_FONT);
    if (hasArabicFont) doc.registerFont("NotoArabic", ARABIC_FONT);

    const pageWidth = 595.28 - 100;

    const defaultFont = hasRegularFont ? "NotoSans" : "Helvetica";

    const writeMixedLine = (text: string, fontSize: number, options: any = {}) => {
      const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]+/g;
      const hasMixedContent = arabicPattern.test(text) && hasArabicFont;
      arabicPattern.lastIndex = 0;

      if (!hasMixedContent) {
        doc.fontSize(fontSize).font(defaultFont);
        doc.text(text, options);
        return;
      }

      const segments: { text: string; isArabic: boolean }[] = [];
      let lastIndex = 0;
      let match;
      while ((match = arabicPattern.exec(text)) !== null) {
        if (match.index > lastIndex) {
          segments.push({ text: text.slice(lastIndex, match.index), isArabic: false });
        }
        segments.push({ text: match[0], isArabic: true });
        lastIndex = arabicPattern.lastIndex;
      }
      if (lastIndex < text.length) {
        segments.push({ text: text.slice(lastIndex), isArabic: false });
      }

      segments.forEach((seg, i) => {
        const isLast = i === segments.length - 1;
        const font = seg.isArabic ? "NotoArabic" : defaultFont;
        doc.fontSize(fontSize).font(font);
        if (isLast) {
          doc.text(seg.text, { ...options, continued: false });
        } else {
          doc.text(seg.text, { ...options, continued: true });
        }
      });
    };

    writeMixedLine(quiz.title, 20, { align: "center" });
    doc.moveDown(0.3);

    if (quiz.description) {
      writeMixedLine(quiz.description, 11, { align: "center" });
    }

    doc.moveDown(0.3);
    doc.fontSize(10).font(defaultFont).fillColor("#666666");
    doc.text(`${questions.length} ta savol`, { align: "center" });
    doc.fillColor("#000000");

    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#cccccc");
    doc.moveDown(0.8);

    questions.forEach((q, idx) => {
      if (doc.y > 700) {
        doc.addPage();
      }

      const questionText = `${idx + 1}. ${q.questionText}`;
      const qRtl = isRtlText(q.questionText);

      if (qRtl && hasArabicFont) {
        doc.fontSize(12).font("NotoArabic");
        doc.text(questionText, { align: "right" });
      } else {
        writeMixedLine(questionText, 12, { align: "left" });
      }

      doc.moveDown(0.3);

      if (q.options && q.options.length > 0) {
        q.options.forEach((opt, optIdx) => {
          const letter = getLetterForIndex(optIdx);
          const optRtl = isRtlText(opt);

          if (optRtl && hasArabicFont) {
            doc.fontSize(11).font("NotoArabic");
            doc.text(`${letter}) ${opt}`, { align: "right", indent: 15 });
          } else {
            writeMixedLine(`   ${letter}) ${opt}`, 11, { align: "left", indent: 15 });
          }
        });
      }

      doc.moveDown(0.6);
    });

    if (includeAnswers) {
      doc.addPage();
      doc.fontSize(18).font(defaultFont);
      doc.text("Javoblar jadvali", { align: "center" });
      doc.moveDown(0.8);

      const colWidth = pageWidth / 4;
      const tableStartX = 50;
      const rowHeight = 28;

      const drawHeaderRow = (y: number) => {
        const headers = ["Savol", "Javob", "Savol", "Javob"];
        headers.forEach((cell, i) => {
          const x = tableStartX + i * colWidth;
          doc.rect(x, y, colWidth, rowHeight).fill("#7c3aed");
          doc.fillColor("#ffffff");
          doc.rect(x, y, colWidth, rowHeight).stroke("#dddddd");
          doc.fontSize(10).font(defaultFont);
          doc.text(cell, x + 5, y + 8, { width: colWidth - 10, align: "center" });
        });
        doc.fillColor("#000000");
      };

      const pairs: { num: string; answer: string }[] = questions.map((q, i) => {
        let answer = q.correctAnswer;
        if (q.options && q.options.length > 0) {
          const correctIdx = q.options.indexOf(q.correctAnswer);
          if (correctIdx >= 0) {
            answer = getLetterForIndex(correctIdx);
          }
        }
        return { num: `${i + 1}`, answer };
      });

      const half = Math.ceil(pairs.length / 2);
      const leftCol = pairs.slice(0, half);
      const rightCol = pairs.slice(half);

      let rowIdx = 0;
      drawHeaderRow(doc.y);
      let tableY = doc.y + rowHeight;

      for (let i = 0; i < leftCol.length; i++) {
        if (tableY > 750) {
          doc.addPage();
          tableY = 50;
          drawHeaderRow(tableY);
          tableY += rowHeight;
          rowIdx = 0;
        }

        const left = leftCol[i];
        const right = rightCol[i] || { num: "", answer: "" };

        const cells = [left.num, left.answer, right.num, right.answer];
        const y = tableY;
        cells.forEach((cell, ci) => {
          const x = tableStartX + ci * colWidth;
          doc.rect(x, y, colWidth, rowHeight).fill(rowIdx % 2 === 0 ? "#f5f3ff" : "#ffffff");
          doc.fillColor("#000000");
          doc.rect(x, y, colWidth, rowHeight).stroke("#dddddd");
          doc.fontSize(10).font(defaultFont);
          doc.text(cell, x + 5, y + 8, { width: colWidth - 10, align: "center" });
        });

        tableY += rowHeight;
        rowIdx++;
      }

      doc.y = tableY + 10;
    }

    doc.end();
  });
}

export async function generateQuizDOCX(
  quiz: QuizData,
  questions: QuizQuestion[],
  includeAnswers: boolean
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: quiz.title,
          bold: true,
          size: 36,
          font: "Arial",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    })
  );

  if (quiz.description) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: quiz.description,
            size: 22,
            font: "Arial",
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      })
    );
  }

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `${questions.length} ta savol`,
          size: 20,
          color: "666666",
          font: "Arial",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    })
  );

  questions.forEach((q, idx) => {
    const questionText = q.questionText;
    const rtl = isRtlText(questionText);

    if (rtl) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: questionText,
              bold: true,
              size: 24,
              font: "Arial",
            }),
          ],
          bidirectional: true,
          alignment: AlignmentType.RIGHT,
          spacing: { before: 200, after: 20 },
        })
      );
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${idx + 1}-savol`,
              bold: true,
              size: 20,
              font: "Arial",
              color: "666666",
            }),
          ],
          alignment: AlignmentType.RIGHT,
          spacing: { after: 100 },
        })
      );
    } else {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${idx + 1}. ${questionText}`,
              bold: true,
              size: 24,
              font: "Arial",
            }),
          ],
          alignment: AlignmentType.LEFT,
          spacing: { before: 200, after: 100 },
        })
      );
    }

    if (q.options && q.options.length > 0) {
      q.options.forEach((opt, optIdx) => {
        const letter = getLetterForIndex(optIdx);
        const optRtl = isRtlText(opt);

        if (optRtl) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `${opt} (${letter}`,
                  size: 22,
                  font: "Arial",
                }),
              ],
              bidirectional: true,
              alignment: AlignmentType.RIGHT,
              indent: { right: 400 },
              spacing: { after: 40 },
            })
          );
        } else {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `${letter}) ${opt}`,
                  size: 22,
                  font: "Arial",
                }),
              ],
              alignment: AlignmentType.LEFT,
              indent: { left: 400 },
              spacing: { after: 40 },
            })
          );
        }
      });
    }
  });

  if (includeAnswers) {
    children.push(
      new Paragraph({
        children: [],
        spacing: { before: 400 },
        pageBreakBefore: true,
      })
    );

    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Javoblar jadvali",
            bold: true,
            size: 32,
            font: "Arial",
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
      })
    );

    const answerPairs = questions.map((q, i) => {
      let answer = q.correctAnswer;
      if (q.options && q.options.length > 0) {
        const correctIdx = q.options.indexOf(q.correctAnswer);
        if (correctIdx >= 0) {
          answer = getLetterForIndex(correctIdx);
        }
      }
      return { num: `${i + 1}`, answer };
    });

    const half = Math.ceil(answerPairs.length / 2);
    const leftCol = answerPairs.slice(0, half);
    const rightCol = answerPairs.slice(half);

    const headerRow = new TableRow({
      children: [
        createHeaderCell("Savol"),
        createHeaderCell("Javob"),
        createHeaderCell("Savol"),
        createHeaderCell("Javob"),
      ],
      tableHeader: true,
    });

    const rows = [headerRow];

    for (let i = 0; i < leftCol.length; i++) {
      const left = leftCol[i];
      const right = rightCol[i] || { num: "", answer: "" };
      const isEven = i % 2 === 0;

      rows.push(
        new TableRow({
          children: [
            createDataCell(left.num, isEven),
            createDataCell(left.answer, isEven),
            createDataCell(right.num, isEven),
            createDataCell(right.answer, isEven),
          ],
        })
      );
    }

    children.push(
      new Table({
        rows,
        width: { size: 100, type: WidthType.PERCENTAGE },
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

function createHeaderCell(text: string): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: true,
            size: 20,
            color: "FFFFFF",
            font: "Arial",
          }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
    shading: {
      type: ShadingType.SOLID,
      color: "7c3aed",
    },
    width: { size: 25, type: WidthType.PERCENTAGE },
  });
}

function createDataCell(text: string, isEven: boolean): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            size: 20,
            font: "Arial",
          }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
    shading: isEven
      ? { type: ShadingType.SOLID, color: "F5F3FF" }
      : undefined,
    width: { size: 25, type: WidthType.PERCENTAGE },
  });
}
