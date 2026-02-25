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

    if (duration <= 35) {
      console.log(`[AI-SERVICE] Audio short (${duration}s), using full file`);
      return convertToMp3(inputPath);
    }

    const segmentLength = 10;
    const maxStart = Math.max(0, duration - segmentLength);
    const starts: number[] = [];
    while (starts.length < 3) {
      const s = Math.floor(Math.random() * maxStart);
      if (starts.every(existing => Math.abs(existing - s) >= segmentLength)) {
        starts.push(s);
      }
    }
    starts.sort((a, b) => a - b);

    const tmpDir = os.tmpdir();
    const segFiles: string[] = [];
    for (let i = 0; i < starts.length; i++) {
      const segFile = path.join(tmpDir, `seg_${Date.now()}_${i}.mp3`);
      execSync(
        `ffmpeg -y -ss ${starts[i]} -i "${inputPath}" -t ${segmentLength} -vn -ar 16000 -ac 1 -b:a 64k "${segFile}" 2>/dev/null`,
        { timeout: 15000 }
      );
      segFiles.push(segFile);
    }

    const listFile = path.join(tmpDir, `concat_${Date.now()}.txt`);
    fs.writeFileSync(listFile, segFiles.map(f => `file '${f}'`).join("\n"));
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${outputPath}" 2>/dev/null`,
      { timeout: 15000 }
    );

    for (const f of segFiles) { try { fs.unlinkSync(f); } catch {} }
    try { fs.unlinkSync(listFile); } catch {}

    console.log(`[AI-SERVICE] Audio sampled: ${duration.toFixed(0)}s -> 30s (3x10s from ${starts.map(s => s.toFixed(0) + "s").join(", ")})`);
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
      model: "whisper-1",
      language: "ar",
    });

    console.log(`[AI-SERVICE] Whisper transcription success: ${response.text?.substring(0, 80)}...`);
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
    typeContext = "\nBu audio yozuvning 30 sekundlik namunasi (sample). O'quvchi to'liq matnni o'qiganmi yoki yo'qmi, shu namuna asosida professional xulosa ber.";
  } else if (submissionType === "image") {
    typeContext = "\nBu o'quvchining daftardagi yozuvi (OCR orqali o'qilgan). Yozuv sifatini ham hisobga ol.";
  }

  const systemMessage = `Sen tajribali arab tili o'qituvchisissan. O'quvchining javobini baholab, 1 dan 10 gacha baho ber va qisqa feedback yoz.

MUHIM QOIDALAR:
- Izohni faqat o'zbek tilida (lotin yozuvida) yoz
- Arab so'zlarini va iboralarini arab alifbosida (عربي) keltir
- Masalan: "O'quvchi «الكتابُ» so'zini to'g'ri talaffuz qildi"
${typeContext}
${instructions ? `\nQo'shimcha ko'rsatma: ${instructions}` : ""}
${prompt ? `\nVazifa ko'rsatmasi: ${prompt}` : ""}

Javobni faqat JSON formatda ber: {"score": <1-10>, "feedback": "<qisqa izoh>"}`;

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
      score: Math.max(1, Math.min(10, Math.round(parsed.score || 0))),
      feedback: parsed.feedback || "Baholab bo'lmadi",
    };
  } catch {
    return { score: 0, feedback: "AI javobini tahlil qilib bo'lmadi" };
  }
}
