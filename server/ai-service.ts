import OpenAI from "openai";
import FormData from "form-data";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MIME_MAP: Record<string, string> = {
  oga: "audio/ogg",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  mp4: "audio/mp4",
  wav: "audio/wav",
  webm: "audio/webm",
  flac: "audio/flac",
  mpeg: "audio/mpeg",
  mpga: "audio/mpeg",
};

export async function transcribeAudio(audioBuffer: Buffer, filename: string = "audio.ogg"): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase() || "ogg";
  const mimeType = MIME_MAP[ext] || "audio/ogg";

  const form = new FormData();
  form.append("file", audioBuffer, {
    filename,
    contentType: mimeType,
  });
  form.append("model", "whisper-1");

  const apiKey = process.env.OPENAI_API_KEY;

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...form.getHeaders(),
    },
    body: form.getBuffer(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[AI-SERVICE] Whisper error ${response.status}: ${errorBody}`);
    throw new Error(`Whisper API error: ${response.status} ${errorBody}`);
  }

  const result = await response.json() as { text: string };
  console.log(`[AI-SERVICE] Whisper transcription success: ${result.text.substring(0, 80)}...`);
  return result.text;
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
