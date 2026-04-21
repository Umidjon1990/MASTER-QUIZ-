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
  const outputPath = inputPath.replace(/\.[^.]+$/, "_first60.mp3");
  try {
    const durationStr = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}" 2>/dev/null`,
      { timeout: 10000 }
    ).toString().trim();
    const duration = parseFloat(durationStr);

    if (duration <= 60) {
      console.log(`[AI-SERVICE] Audio ${duration.toFixed(1)}s ≤ 60s, using full file`);
      return convertToMp3(inputPath);
    }

    execSync(
      `ffmpeg -y -ss 0 -i "${inputPath}" -t 60 -vn -ar 16000 -ac 1 -b:a 64k "${outputPath}" 2>/dev/null`,
      { timeout: 30000 }
    );

    console.log(`[AI-SERVICE] Audio truncated: ${duration.toFixed(0)}s -> first 60s`);
    return outputPath;
  } catch (e) {
    console.log(`[AI-SERVICE] Audio truncation failed, converting full file`);
    return convertToMp3(inputPath);
  }
}

export function extractAudioFromVideo(videoBuffer: Buffer): Buffer {
  const tmpVideo = path.join(os.tmpdir(), `video_${Date.now()}.mp4`);
  const tmpAudio = path.join(os.tmpdir(), `video_audio_${Date.now()}.mp3`);
  fs.writeFileSync(tmpVideo, videoBuffer);
  console.log(`[AI-SERVICE] Extracting audio from video: ${videoBuffer.length} bytes`);

  try {
    execSync(
      `ffmpeg -y -i "${tmpVideo}" -vn -ar 16000 -ac 1 -b:a 64k "${tmpAudio}" 2>/dev/null`,
      { timeout: 60000 }
    );
    const audioBuffer = fs.readFileSync(tmpAudio);
    console.log(`[AI-SERVICE] Video audio extracted: ${audioBuffer.length} bytes`);
    return audioBuffer;
  } catch (e) {
    console.error("[AI-SERVICE] Video audio extraction failed:", e);
    throw new Error("Video dan audio chiqarib bo'lmadi");
  } finally {
    try { fs.unlinkSync(tmpVideo); } catch {}
    try { fs.unlinkSync(tmpAudio); } catch {}
  }
}

export async function transcribeAudio(audioBuffer: Buffer, filename: string = "audio.ogg"): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase() || "ogg";
  const tmpInput = path.join(os.tmpdir(), `whisper_${Date.now()}.${ext}`);
  fs.writeFileSync(tmpInput, audioBuffer);
  console.log(`[AI-SERVICE] Temp file written: ${tmpInput}, size=${audioBuffer.length}, ext=${ext}`);

  let tmpFile: string;
  try {
    tmpFile = extractAudioSample(tmpInput);
  } catch (sampleErr) {
    console.log(`[AI-SERVICE] extractAudioSample failed (ffmpeg missing?), sending raw file to Whisper:`, (sampleErr as Error).message);
    tmpFile = tmpInput;
  }

  try {
    const response = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tmpFile),
      model: "gpt-4o-mini-transcribe",
      prompt: "Bu audioda o'quvchi arab tilidagi matnni o'qiydi va o'zbek tiliga tarjima qiladi. Audioda arabcha va o'zbekcha aralash bo'ladi. O'zbek tilidagi qismlarni ALBATTA lotin alifbosida yoz (masalan: bu kitob foydali, tarjima qilish kerak). Arab tilidagi qismlarni arab alifbosida yoz. Hech qachon o'zbek tilini arab yoki kirill harflarida yozma — faqat lotin. Misol: 'الكتاب المفيد — bu foydali kitob, o'qish uchun yaxshi'.",
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
  isMemorization,
}: {
  prompt?: string;
  referenceText?: string;
  studentAnswer: string;
  instructions?: string;
  submissionType?: string;
  isMemorization?: boolean;
}): Promise<{ score: number; feedback: string }> {
  let systemMessage: string;
  let userMessage: string;

  if (isMemorization && !referenceText) {
    console.warn("[AI-SERVICE] isMemorization=true but referenceText is missing, falling back to translation mode");
  }

  if (isMemorization && referenceText) {
    systemMessage = `Sen mehribon, tajribali arab tili ustozisan. Sening vazifang — huddi sinfdagi o'qituvchi kabi o'quvchining YODLASH sifatini do'stona, samimiy ohangda baholash.

OHANG VA USLUB (juda muhim):
- DO'STONA, samimiy ustoz kabi gapir — rasmiy emas
- HAR XIL boshla — har safar boshqacha so'z bilan boshlash kerak (masalan: "Yaxshi urinish!", "Barakalla!", "Ofarin!", "Mehnating ko'rinib turibdi!", "Astoydil tayyorlanibsan!", "Zo'r ish qildingiz!", "Mashq qilganing seziladi", "Yaxshigina chiqibdi", "Harakating menga yoqdi", va h.k.). Hech qachon ikki o'quvchiga bir xil iborani ishlatma.
- Optimistic ohangda — kamchiliklarni yumshoq ayt, kuchli tomonlarni alohida ta'kidla
- O'quvchini "siz" deb murojaat qil, do'stona ammo hurmat bilan
- Real ustoz kabi: "men ko'rdimki...", "menga yoqdi...", "keyingi safar..." kabi shaxsiy iboralarni ishlat
- Quruq, formal til ISHLATMA: "tahlil natijasi", "baholash mezoni" kabi iboralardan qoch

TRANSKRIPSIYA HAQIDA:
- O'quvchining javobi audio dan avtomatik transkripsiya qilingan
- Transkripsiya xatolari o'quvchining xatosi EMAS
- Arab so'zlari lotin harflarida chiqishi mumkin — bu NORMAL
- MAZMUN ga e'tibor ber, transkripsiya sifatiga EMAS

SOLISHTIRISH MEZONLARI:
- Asl matn bilan o'quvchi javobi o'rtasidagi farqlarni aniqla
- Tushirib qoldirilgan qismlar, o'zgartirilgan so'zlar, tartib o'zgarishi

BAHOLASH SHKALA (10 ballik, optimistik):
- 9-10: Matnni a'lo darajada yodlagan (90-100%), faxrlanish kerak
- 7-8: Yaxshi tayyorlangan (70-89%), kichik kamchiliklar bor
- 6: O'rtacha (50-69%), harakat bor lekin hali mashq kerak
- 5: Boshlang'ich daraja (0-49%), ko'p mashq qilish kerak
- Optimistik bo'l — o'quvchi astoydil urinib ko'rgan bo'lsa, baho 6-7 dan past tushmasin

IZOH (30-50 so'z, lotin yozuvi, do'stona):
- Yangicha boshla (oldingi ko'rsatmaga qara)
- Yodlashning kuchli tomonini ayt (to'g'ri aytilgan qismlar)
- Agar kamchilik bo'lsa — yumshoq, do'stona aytib o't
- Iliq, rag'batlantiruvchi xulosa bilan tugat
- Arab so'zlarini kerak bo'lsa arab alifbosida (عربي) keltir
${instructions ? `\nO'qituvchi ko'rsatmasi: ${instructions}` : ""}
${prompt ? `\nVazifa ko'rsatmasi: ${prompt}` : ""}

Javobni faqat JSON formatda ber: {"score": <5-10>, "feedback": "<30-50 so'zli do'stona izoh>"}`;

    userMessage = `Asl matn (yodlash kerak edi):\n${referenceText}\n\nO'quvchi yoddan aytgani:\n${studentAnswer}`;
  } else {
    let typeContext = "";
    if (submissionType === "audio_sample") {
      typeContext = "\nBu audio yozuvning 3 joydan olingan namunasi (boshi, o'rtasi, oxiri). Shu namuna asosida o'quvchining umumiy o'qish sifatini baholay.";
    } else if (submissionType === "image") {
      typeContext = "\nBu o'quvchining daftardagi yozuvi (OCR orqali o'qilgan). Yozuv sifatini ham hisobga ol.";
    }

    systemMessage = `Sen mehribon, tajribali arab tili ustozisan. Sening vazifang — huddi sinfdagi o'qituvchi kabi o'quvchining tarjima sifatini do'stona, samimiy ohangda baholash.

OHANG VA USLUB (juda muhim):
- DO'STONA, samimiy ustoz kabi gapir — rasmiy emas
- HAR XIL boshla — har safar boshqacha ibora bilan boshla (masalan: "Yaxshi urinish!", "Barakalla!", "Ofarin!", "Mehnating ko'rinib turibdi!", "Astoydil tayyorlanibsan!", "Zo'r ish qildingiz!", "Mashq qilganing seziladi", "Yaxshigina chiqibdi", "Harakating menga yoqdi", "Tarjimangiz menga yoqdi", va h.k.). Hech qachon ikki o'quvchiga bir xil iborani ishlatma.
- Optimistik ohangda — kamchiliklarni yumshoq, dalda berib ayt; kuchli tomonlarni alohida ta'kidla
- O'quvchini "siz" deb murojaat qil, do'stona ammo hurmat bilan
- Real ustoz kabi: "menga yoqdi...", "ajoyib o'gribsiz", "keyingi safar yana yaxshilang" kabi shaxsiy iboralarni ishlat
- Quruq, formal til ISHLATMA: "tahlil natijasi", "baholash mezoni" kabi iboralardan qoch

JARAYON:
O'quvchi arab tilidagi asl matnni ovozli o'qiydi va o'zbek tiliga MA'NOVIY TARJIMA qiladi.

TRANSKRIPSIYA HAQIDA:
- O'quvchining javobi audio dan avtomatik transkripsiya qilingan
- Audioda arab va o'zbek tillari ARALASH bo'ladi — bu NORMAL
- Arab so'zlari lotin harflarida chiqishi mumkin — bu NORMAL
- Transkripsiya sifatiga EMAS, o'quvchining TARJIMA MAZMUNIGA e'tibor ber

BAHOLASH SHKALA (10 ballik, optimistik):
- Asosiy mezon: o'quvchi asl matnning MAZMUNINI tushunganmi va o'zbekchaga yetkazganmi?
- So'zma-so'z tarjima shart EMAS — erkin tarjima, ma'no tarjimasi to'liq qabul qilinadi
- 9-10: A'lo tarjima, mazmun to'liq yetkazilgan
- 7-8: Yaxshi, asosiy g'oyalar to'g'ri o'tkazilgan, kichik kamchiliklar
- 6: O'rtacha, asosiy mazmun bor lekin ba'zi o'rinlar tushunilmagan
- 5: Boshlang'ich daraja, ko'p mashq kerak
- Optimistik bo'l — o'quvchi astoydil urinib ko'rgan bo'lsa, baho 6 dan past tushmasin
- O'quvchidan sharh, izoh yoki tushuntirish KUTILMAYDI — u faqat tarjimachi

IZOH (30-50 so'z, lotin yozuvi, do'stona):
- Yangicha boshla (oldingi ko'rsatmaga qara)
- Tarjimaning kuchli tomonini ayt
- Agar kamchilik bo'lsa — yumshoq, do'stona aytib o't
- Iliq, rag'batlantiruvchi xulosa bilan tugat
- Arab so'zlarini kerak bo'lsa arab alifbosida (عربي) keltir
- "tushuntirish yetarli emas", "sharh kam", "umuman noto'g'ri" kabi salbiy iboralarni ISHLATMA
${typeContext}
${instructions ? `\nO'qituvchi ko'rsatmasi: ${instructions}` : ""}
${prompt ? `\nVazifa ko'rsatmasi: ${prompt}` : ""}

Javobni faqat JSON formatda ber: {"score": <5-10>, "feedback": "<30-50 so'zli do'stona izoh>"}`;

    userMessage = referenceText
      ? `Asl matn (tarjima qilish kerak edi):\n${referenceText}\n\nO'quvchining javobi:\n${studentAnswer}`
      : `O'quvchining javobi:\n${studentAnswer}`;
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
    temperature: 0.95,
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
