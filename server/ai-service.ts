import OpenAI from "openai";
import fs from "fs";
import path from "path";
import os from "os";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function transcribeAudio(audioBuffer: Buffer, filename: string = "audio.oga"): Promise<string> {
  const tmpPath = path.join(os.tmpdir(), `whisper_${Date.now()}_${filename}`);
  fs.writeFileSync(tmpPath, audioBuffer);
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tmpPath),
      model: "whisper-1",
    });
    return transcription.text;
  } finally {
    fs.unlinkSync(tmpPath);
  }
}

export async function evaluateSubmission({
  prompt,
  referenceText,
  studentAnswer,
  instructions,
}: {
  prompt?: string;
  referenceText?: string;
  studentAnswer: string;
  instructions?: string;
}): Promise<{ score: number; feedback: string }> {
  const systemMessage = `Sen tajribali arab tili o'qituvchisissan. O'quvchining javobini baholab, 1 dan 10 gacha baho ber va qisqa feedback yoz.
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
