import PDFDocument from "pdfkit";
import path from "path";
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

const FONT_DIR = path.join(process.cwd(), "server", "fonts");
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

    doc.registerFont("NotoArabic", ARABIC_FONT);
    doc.registerFont("NotoSans", REGULAR_FONT);

    const pageWidth = 595.28 - 100;

    const pickFont = (text: string) => isRtlText(text) ? "NotoArabic" : "NotoSans";

    doc.fontSize(20).font(pickFont(quiz.title));
    doc.text(quiz.title, { align: "center" });
    doc.moveDown(0.3);

    if (quiz.description) {
      doc.fontSize(11).font(pickFont(quiz.description));
      doc.text(quiz.description, { align: "center" });
    }

    doc.moveDown(0.3);
    doc.fontSize(10).font("NotoSans").fillColor("#666666");
    doc.text(`${questions.length} ta savol`, { align: "center" });
    doc.fillColor("#000000");

    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#cccccc");
    doc.moveDown(0.8);

    questions.forEach((q, idx) => {
      if (doc.y > 700) {
        doc.addPage();
      }

      const questionText = q.questionText;
      const rtl = isRtlText(questionText);

      doc.fontSize(12).font(pickFont(questionText));
      if (rtl) {
        doc.text(`${idx + 1}. ${questionText}`, { align: "right" });
      } else {
        doc.text(`${idx + 1}. ${questionText}`, { align: "left" });
      }

      doc.moveDown(0.3);

      if (q.options && q.options.length > 0) {
        q.options.forEach((opt, optIdx) => {
          const letter = getLetterForIndex(optIdx);
          const optRtl = isRtlText(opt);

          doc.fontSize(11).font(pickFont(opt));

          if (optRtl) {
            doc.text(`${letter}) ${opt}`, { align: "right", indent: 15 });
          } else {
            doc.text(`   ${letter}) ${opt}`, { align: "left", indent: 15 });
          }
        });
      }

      doc.moveDown(0.6);
    });

    if (includeAnswers) {
      doc.addPage();
      doc.fontSize(18).font("NotoSans");
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
          doc.fontSize(10).font("NotoSans");
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
          doc.fontSize(10).font("NotoSans");
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

  const titleRtl = isRtlText(quiz.title);

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: quiz.title,
          bold: true,
          size: 36,
          font: titleRtl ? "Arial" : "Arial",
          rightToLeft: titleRtl,
        }),
      ],
      alignment: AlignmentType.CENTER,
      bidirectional: titleRtl,
      spacing: { after: 100 },
    })
  );

  if (quiz.description) {
    const descRtl = isRtlText(quiz.description);
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: quiz.description,
            size: 22,
            font: "Arial",
            rightToLeft: descRtl,
          }),
        ],
        alignment: AlignmentType.CENTER,
        bidirectional: descRtl,
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

    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${idx + 1}. ${questionText}`,
            bold: true,
            size: 24,
            font: "Arial",
            rightToLeft: rtl,
          }),
        ],
        alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
        bidirectional: rtl,
        spacing: { before: 200, after: 100 },
      })
    );

    if (q.options && q.options.length > 0) {
      q.options.forEach((opt, optIdx) => {
        const letter = getLetterForIndex(optIdx);
        const optRtl = isRtlText(opt);

        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${letter}) ${opt}`,
                size: 22,
                font: "Arial",
                rightToLeft: optRtl,
              }),
            ],
            alignment: optRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            bidirectional: optRtl,
            indent: { left: 400 },
            spacing: { after: 40 },
          })
        );
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
