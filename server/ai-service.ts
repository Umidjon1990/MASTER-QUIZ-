import OpenAI from "openai";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function convertToMp3(inputPath: string): string {
  const outputPath = inputPath.replace(/\.[^.]+$/, "_converted.mp3");
  try {
    execSync(
      `ffmpeg -y -i "${inputPath}" -vn -ar 16000 -ac 1 -b:a 64k "${outputPath}" 2>/dev/null`,
      { timeout: 30000 }
    );
    console.log(`[AI-SERVICE] ffmpeg converted: ${fs.statSync(inputPath).size} -> ${fs.statSync(outputPath).size} bytes`);
    return outputPath;
  } catch (e) {
    console.log(`[AI-SERVICE] ffmpeg conversion failed, using original file`);
    return inputPath;
  }
}

export function extractAudioSample(inputPath: string): string {
  const outputPath = inputPath.replace(/\.[^.]+$/, "_sample.mp3");
  try {
    const durationStr = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}" 2>/dev/null`,
      { timeout: 10000 }
    ).toString().trim();
    const duration = parseFloat(durationStr);

    if (duration <= 65) {
      console.log(`[AI-SERVICE] Audio short (${duration}s), using full file`);
      return convertToMp3(inputPath);
    }

    const tmpDir = os.tmpdir();
    const ts = Date.now();
    const segStart = path.join(tmpDir, `seg_start_${ts}.mp3`);
    const segMid = path.join(tmpDir, `seg_mid_${ts}.mp3`);
    const segEnd = path.join(tmpDir, `seg_end_${ts}.mp3`);

    execSync(
      `ffmpeg -y -ss 0 -i "${inputPath}" -t 20 -vn -ar 16000 -ac 1 -b:a 64k "${segStart}" 2>/dev/null`,
      { timeout: 15000 }
    );

    const midStart = Math.max(0, (duration / 2) - 10);
    execSync(
      `ffmpeg -y -ss ${midStart} -i "${inputPath}" -t 20 -vn -ar 16000 -ac 1 -b:a 64k "${segMid}" 2>/dev/null`,
      { timeout: 15000 }
    );

    const endStart = Math.max(0, duration - 20);
    execSync(
      `ffmpeg -y -ss ${endStart} -i "${inputPath}" -t 20 -vn -ar 16000 -ac 1 -b:a 64k "${segEnd}" 2>/dev/null`,
      { timeout: 15000 }
    );

    const listFile = path.join(tmpDir, `concat_${ts}.txt`);
    fs.writeFileSync(listFile, `file '${segStart}'\nfile '${segMid}'\nfile '${segEnd}'`);
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${outputPath}" 2>/dev/null`,
      { timeout: 15000 }
    );

    try { fs.unlinkSync(segStart); } catch {}
    try { fs.unlinkSync(segMid); } catch {}
    try { fs.unlinkSync(segEnd); } catch {}
    try { fs.unlinkSync(listFile); } catch {}

    console.log(`[AI-SERVICE] Audio sampled: ${duration.toFixed(0)}s -> 60s (boshi 20s + o'rtasi 20s + oxiri 20s)`);
    return outputPath;
  } catch (e) {
    console.log(`[AI-SERVICE] Audio sampling failed, converting full file`);
    return convertToMp3(inputPath);
  }
}

export async function transcribeAudio(audioBuffer: Buffer, filename: string = "audio.ogg"): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase() || "ogg";
  const tmpInput = path.join(os.tmpdir(), `whisper_${Date.now()}.${ext}`);
  fs.writeFileSync(tmpInput, audioBuffer);
  console.log(`[AI-SERVICE] Temp file written: ${tmpInput}, size=${audioBuffer.length}, ext=${ext}`);

  const tmpFile = extractAudioSample(tmpInput);

  try {
    const response = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tmpFile),
      model: "gpt-4o-mini-transcribe",
      prompt: "O'quvchi ovozli xabar yuboradi. Matnda har xil tillar (arabcha, o'zbekcha, inglizcha va boshqalar) aralash bo'lishi mumkin — barchasi tabiy holda. O'zbek tilidagi qismlarni faqat lotin alifbosida yoz. Arab tilidagi qismlarni arab alifbosida yoz. Boshqa tillarda o'sha tilning alifbosida yoz. Aniq eshitilganicha yoz.",
    });

    console.log(`[AI-SERVICE] STT transcription success: ${response.text?.substring(0, 80)}...`);
    return response.text;
  } finally {
    try { fs.unlinkSync(tmpInput); } catch {}
    if (tmpFile !== tmpInput) {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  }
}

export function ocrImage(imageBuffer: Buffer): string {
  const tmpInput = path.join(os.tmpdir(), `ocr_${Date.now()}.jpg`);
  const tmpOutput = path.join(os.tmpdir(), `ocr_${Date.now()}_out`);
  fs.writeFileSync(tmpInput, imageBuffer);

  try {
    execSync(
      `tesseract "${tmpInput}" "${tmpOutput}" -l uzb+eng+rus 2>/dev/null`,
      { timeout: 30000 }
    );
    const text = fs.readFileSync(`${tmpOutput}.txt`, "utf-8").trim();
    console.log(`[AI-SERVICE] OCR result (${text.length} chars): ${text.substring(0, 80)}...`);
    return text;
  } catch (e) {
    console.log(`[AI-SERVICE] OCR failed:`, e);
    return "";
  } finally {
    try { fs.unlinkSync(tmpInput); } catch {}
    try { fs.unlinkSync(`${tmpOutput}.txt`); } catch {}
  }
}

export async function evaluateSubmission({
  prompt,
  referenceText,
  studentAnswer,
  instructions,
  submissionType,
}: {
  prompt?: string;
  referenceText?: string;
  studentAnswer: string;
  instructions?: string;
  submissionType?: string;
}): Promise<{ score: number; feedback: string }> {
  let typeContext = "";
  if (submissionType === "audio_sample") {
    typeContext = "\nESLATMA: Bu audio yozuvning 3 joydan olingan namunasi (boshi, o'rtasi, oxiri). Shu namuna asosida o'quvchining umumiy o'qish va tarjima sifatini baholay.";
  } else if (submissionType === "image") {
    typeContext = "\nESLATMA: Bu o'quvchining daftardagi yozuvi (OCR orqali o'qilgan). Mazmunni baholashda yozuv sifatini ham hisobga ol.";
  }

  const systemMessage = `Sen tajribali o'qituvchissan va o'quvchilarning topshiriqlarini baholaysan.

BAHOLASH JARAYONI:
- O'quvchi ovozli xabar yuboradi, u avtomatik matnga aylantiriladi
- Matnda turli tillar aralash bo'lishi mumkin — bu NORMAL holat
- Ba'zi so'zlar transkripsiyada buzilishi yoki noto'g'ri yozilishi mumkin — buni o'quvchining xatosi deb hisoblaMA
- Asosiy e'tibor: o'quvchi vazifani TUSHUNDIMI va BAJARISHGA HARAKAT QILDIMI?

BAHOLASH MEZONI (5-10 shkala):
- 9-10: Vazifa to'liq va sifatli bajarilgan
- 7-8: Asosiy qism to'g'ri, kichik kamchiliklar bor
- 5-6: O'quvchi harakat qilgan, lekin muhim kamchiliklar ko'zga tashlanadi
- 5: Butunlay noto'g'ri yoki bo'sh javob (minimal baho)

IZOH (30-40 so'z, o'zbek tilida lotin yozuvida):
- Kuchli tomonlarini ayt
- Kamchilik bo'lsa — qisqa va aniq ko'rsat
- Rag'batlantiruvchi xulosa bilan tugat
- "tushuntirish yetarli emas" kabi salbiy iboralar ISHLATMA
${typeContext}
${instructions ? `\nO'QITUVCHI KO'RSATMASI (eng muhim — shu ko'rsatmaga asoslanib baho ber):\n${instructions}` : ""}
${prompt ? `\nVAZIFA KO'RSATMASI:\n${prompt}` : ""}

Javobni faqat JSON formatda ber: {"score": <5-10>, "feedback": "<30-40 so'zli izoh>"}`;

  const userMessage = referenceText
    ? `Mavzu matni (asl material):\n${referenceText}\n\nO'quvchining javobi:\n${studentAnswer}`
    : `O'quvchining javobi:\n${studentAnswer}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0].message.content || '{"score": 0, "feedback": "Xatolik yuz berdi"}';
  try {
    const parsed = JSON.parse(content);
    return {
      score: Math.max(5, Math.min(10, Math.round(parsed.score || 5))),
      feedback: parsed.feedback || "Baholab bo'lmadi",
    };
  } catch {
    return { score: 0, feedback: "AI javobini tahlil qilib bo'lmadi" };
  }
}
