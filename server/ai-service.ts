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
    typeContext = "\nBu audio yozuvning 3 joydan olingan namunasi (boshi, o'rtasi, oxiri). Shu namuna asosida o'quvchining umumiy o'qish sifatini baholay.";
  } else if (submissionType === "image") {
    typeContext = "\nBu o'quvchining daftardagi yozuvi (OCR orqali o'qilgan). Yozuv sifatini ham hisobga ol.";
  }

  const systemMessage = `Sen tajribali arab tili o'qituvchisissan. Vazifang — o'quvchining TARJIMA sifatini baholash.

MUHIM KONTEKST:
- O'quvchi ARAB tilidagi asl matnni OVOZLI O'QIYDI va keyin O'ZBEK TILIDA TARJIMA qiladi
- Audio transkripsiyada arab so'zlari va o'zbekcha tarjima ARALASH bo'lishi mumkin — bu NORMAL
- Transkripsiyada arab so'zlari lotin harflarida (transliteratsiya) yozilishi mumkin — bu ham NORMAL
- O'quvchi faqat TARJIMA qiladi — undan sharh, izoh, tushuntirish yoki qo'shimcha ma'lumot KUTILMAYDI

TRANSKRIPSIYA XUSUSIYATLARI (juda muhim):
- Audio transkripsiya avtomatik ishlanadi, shuning uchun ba'zi so'zlar noto'g'ri yozilishi mumkin
- Arab so'zlari lotin harflarida chiqishi mumkin (masalan: "an-na'tu" = "النعت")
- O'zbek so'zlari arab harflarida chiqishi mumkin
- Transkripsiya sifatiga emas, O'QUVCHINING TARJIMA MAZMUNIGA e'tibor ber

BAHOLASH QOIDALARI:
- Asosiy mezon: o'quvchi asl matnning MAZMUNINI tushunganmi va o'zbekchaga yetkazganmi?
- Tarjima so'zma-so'z bo'lishi shart emas — umumiy ma'no to'g'ri bo'lsa, YAXSHI baho ber
- Erkin tarjima ham qabul qilinadi — mazmun saqlanishi kifoya
- Agar o'quvchi matnning asosiy g'oyalarini o'zbekchaga o'tkazgan bo'lsa — kamida 7/10
- Agar o'quvchi harakat qilgan bo'lsa, kamida 5/10 baho ber
- Faqat butunlay noto'g'ri, mavzuga aloqasiz yoki bo'sh javobga past baho ber

IZOH QOIDALARI (MUHIM — qat'iy amal qil):
- Izoh 30-40 so'zdan iborat bo'lsin
- Izohni faqat o'zbek tilida (lotin yozuvida) yoz
- Kerak bo'lsa arab so'zlarini arab alifbosida (عربي) keltir
- IZOHDA QUYIDAGILARNI ISHLATMA:
  - "tushuntirish yetarli emas", "yaxshi yoritilmagan", "kengroq sharhlash kerak" — chunki o'quvchidan sharh kutilmaydi
  - "o'z fikrini bildirmagan" — chunki o'quvchidan fikr kutilmaydi
  - "umuman noto'g'ri" — agar mazmun mavzuga aloqador bo'lsa
- IZOH TUZILISHI:
  1. Tarjima sifati haqida: ma'no to'g'ri yetkazilganmi?
  2. Agar ba'zi qismlar tarjima qilinmagan yoki noto'g'ri tarjima qilingan bo'lsa — qisqa ayt
  3. Qisqa rag'batlantiruvchi xulosa
- Agar tarjima to'g'ri bo'lsa, nimani yaxshi tarjima qilganini ayt
${typeContext}
${instructions ? `\nQo'shimcha ko'rsatma: ${instructions}` : ""}
${prompt ? `\nVazifa ko'rsatmasi: ${prompt}` : ""}

Javobni faqat JSON formatda ber: {"score": <5-10>, "feedback": "<30-40 so'zli izoh>"}`;

  const userMessage = referenceText
    ? `Asl matn (tarjima qilish kerak edi):\n${referenceText}\n\nO'quvchining javobi:\n${studentAnswer}`
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
