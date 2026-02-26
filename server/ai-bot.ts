import TelegramBot from "node-telegram-bot-api";
import { transcribeAudio, evaluateSubmission, ocrImage } from "./ai-service";
import type { IStorage } from "./storage";

export const activeBots = new Map<string, TelegramBot>();

const studentSessions = new Map<string, {
  aiClassId: string;
  aiStudentId: string;
  selectedLessonNumber: number | null;
  currentTaskIndex: number;
  awaitingPhone: boolean;
}>();

export async function startAiBot(aiClassId: string, token: string, storage: IStorage) {
  if (activeBots.has(aiClassId)) {
    stopAiBot(aiClassId);
  }

  const bot = new TelegramBot(token, { polling: true });
  activeBots.set(aiClassId, bot);

  const aiClass = await storage.getAiClass(aiClassId);
  if (!aiClass) return;

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id.toString();
    const existing = await storage.getAiStudentByTelegramChatId(chatId);
    if (existing && existing.aiClassId === aiClassId) {
      studentSessions.set(chatId, {
        aiClassId,
        aiStudentId: existing.id,
        selectedLessonNumber: null,
        currentTaskIndex: 0,
        awaitingPhone: false,
      });
      await bot.sendMessage(Number(chatId), `Xush kelibsiz, ${existing.name}! Darslarni ko'rish uchun /vazifa buyrug'ini yuboring.`);
      return;
    }

    studentSessions.set(chatId, {
      aiClassId,
      aiStudentId: "",
      selectedLessonNumber: null,
      currentTaskIndex: 0,
      awaitingPhone: true,
    });

    await bot.sendMessage(Number(chatId),
      `Assalomu alaykum! "${aiClass.name}" sinfiga xush kelibsiz.\n\nIltimos, telefon raqamingizni yuboring (masalan: 998901234567):`,
      {
        reply_markup: {
          keyboard: [[{ text: "📱 Telefon raqamni yuborish", request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      }
    );
  });

  bot.onText(/\/vazifa/, async (msg) => {
    const chatId = msg.chat.id.toString();
    const session = studentSessions.get(chatId);
    if (!session || !session.aiStudentId) {
      await bot.sendMessage(Number(chatId), "Avval /start buyrug'ini yuboring va telefon raqamingizni tasdiqlang.");
      return;
    }
    session.selectedLessonNumber = null;
    session.currentTaskIndex = 0;
    await sendLessonList(bot, chatId, session, storage);
  });

  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id.toString();
    if (!chatId) return;
    const session = studentSessions.get(chatId);
    if (!session || !session.aiStudentId) {
      await bot.answerCallbackQuery(query.id, { text: "Avval /start buyrug'ini yuboring." });
      return;
    }

    const data = query.data;
    if (data?.startsWith("lesson_")) {
      const lessonNum = parseInt(data.replace("lesson_", ""));
      const tasks = await storage.getAiTasks(session.aiClassId);
      const lessonTasks = tasks.filter(t => t.lessonNumber === lessonNum).sort((a, b) => a.orderIndex - b.orderIndex);

      if (lessonTasks.length === 0) {
        await bot.answerCallbackQuery(query.id, { text: "Bu darsda vazifalar yo'q." });
        return;
      }

      const submissions = await storage.getAiSubmissions(session.aiStudentId);
      const completedTaskIds = new Set(submissions.filter(s => s.status === "completed").map(s => s.aiTaskId));
      const allDone = lessonTasks.every(t => completedTaskIds.has(t.id));
      if (allDone) {
        await bot.answerCallbackQuery(query.id, { text: "Bu dars allaqachon topshirilgan!" });
        return;
      }

      session.selectedLessonNumber = lessonNum;
      const firstUndone = lessonTasks.findIndex(t => !completedTaskIds.has(t.id));
      session.currentTaskIndex = firstUndone >= 0 ? firstUndone : 0;

      await bot.answerCallbackQuery(query.id);
      await sendCurrentTask(bot, chatId, session, storage);
    } else if (data === "back_to_lessons") {
      session.selectedLessonNumber = null;
      session.currentTaskIndex = 0;
      await bot.answerCallbackQuery(query.id);
      await sendLessonList(bot, chatId, session, storage);
    }
  });

  bot.on("contact", async (msg) => {
    const chatId = msg.chat.id.toString();
    const session = studentSessions.get(chatId);
    if (!session || !session.awaitingPhone) return;

    const phone = (msg.contact?.phone_number || "").replace(/\D/g, "");
    await matchStudent(bot, chatId, phone, session, storage, aiClassId);
  });

  bot.on("voice", async (msg) => {
    await handleAudioSubmission(bot, msg, storage);
  });

  bot.on("audio", async (msg) => {
    await handleAudioSubmission(bot, msg, storage);
  });

  bot.on("photo", async (msg) => {
    await handleImageSubmission(bot, msg, storage);
  });

  bot.on("message", async (msg) => {
    if (msg.contact || msg.voice || msg.audio || msg.photo || msg.text?.startsWith("/")) return;
    const chatId = msg.chat.id.toString();
    const session = studentSessions.get(chatId);
    if (!session) return;

    if (session.awaitingPhone && msg.text) {
      const phone = msg.text.replace(/\D/g, "");
      if (phone.length >= 9) {
        await matchStudent(bot, chatId, phone, session, storage, aiClassId);
      } else {
        await bot.sendMessage(Number(chatId), "Telefon raqam noto'g'ri. Qaytadan kiriting (masalan: 998901234567):");
      }
      return;
    }

    if (msg.text && session.aiStudentId && !session.awaitingPhone) {
      await handleTextSubmission(bot, msg, storage);
    }
  });

  console.log(`[AI-BOT] Bot started for class ${aiClassId}`);
}

function getLessonNumbers(tasks: any[]): number[] {
  const nums = new Set<number>();
  tasks.forEach(t => nums.add(t.lessonNumber));
  return Array.from(nums).sort((a, b) => a - b);
}

async function sendLessonList(bot: TelegramBot, chatId: string, session: any, storage: IStorage) {
  const tasks = await storage.getAiTasks(session.aiClassId);
  if (tasks.length === 0) {
    await bot.sendMessage(Number(chatId), "Hozircha darslar yo'q. O'qituvchi darslarni qo'shishi kerak.");
    return;
  }

  const lessonNumbers = getLessonNumbers(tasks);
  const submissions = await storage.getAiSubmissions(session.aiStudentId);
  const completedTaskIds = new Set(submissions.filter(s => s.status === "completed").map(s => s.aiTaskId));

  let completedLessons = 0;
  let totalScore = 0;
  let totalTasks = 0;

  const lessonStatuses: { num: number; done: boolean; tasksDone: number; tasksTotal: number }[] = [];
  for (const num of lessonNumbers) {
    const lessonTasks = tasks.filter(t => t.lessonNumber === num);
    const doneCount = lessonTasks.filter(t => completedTaskIds.has(t.id)).length;
    const allDone = doneCount === lessonTasks.length;
    if (allDone) completedLessons++;
    totalTasks += lessonTasks.length;
    lessonStatuses.push({ num, done: allDone, tasksDone: doneCount, tasksTotal: lessonTasks.length });
  }

  totalScore = submissions
    .filter(s => s.status === "completed")
    .reduce((sum, s) => sum + (s.score || 0), 0);

  const completedTotal = submissions.filter(s => s.status === "completed").length;

  let message = `📚 Darslar ro'yxati (${completedLessons}/${lessonNumbers.length} dars topshirilgan)\n`;
  if (completedTotal > 0) {
    message += `📊 Umumiy ball: ${totalScore}/${completedTotal * 10}\n`;
  }
  message += `\nQuyidagi darslardan birini tanlang:`;

  const keyboard: TelegramBot.InlineKeyboardButton[][] = [];
  const ROW_SIZE = 3;
  for (let i = 0; i < lessonNumbers.length; i += ROW_SIZE) {
    const row: TelegramBot.InlineKeyboardButton[] = [];
    for (let j = i; j < Math.min(i + ROW_SIZE, lessonNumbers.length); j++) {
      const ls = lessonStatuses[j];
      let icon = "📝";
      if (ls.done) icon = "✅";
      else if (ls.tasksDone > 0) icon = `${ls.tasksDone}/${ls.tasksTotal}`;
      row.push({
        text: `${ls.num}-dars ${icon}`,
        callback_data: `lesson_${ls.num}`,
      });
    }
    keyboard.push(row);
  }

  await bot.sendMessage(Number(chatId), message, {
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function sendCurrentTask(bot: TelegramBot, chatId: string, session: any, storage: IStorage) {
  const tasks = await storage.getAiTasks(session.aiClassId);
  const lessonTasks = tasks
    .filter(t => t.lessonNumber === session.selectedLessonNumber)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  if (session.currentTaskIndex >= lessonTasks.length) {
    const submissions = await storage.getAiSubmissions(session.aiStudentId);
    const lessonTaskIds = new Set(lessonTasks.map(t => t.id));
    const lessonSubs = submissions.filter(s => s.status === "completed" && lessonTaskIds.has(s.aiTaskId));
    const lessonScore = lessonSubs.reduce((sum, s) => sum + (s.score || 0), 0);

    await bot.sendMessage(Number(chatId),
      `🎉 ${session.selectedLessonNumber}-dars topshirildi!\n📊 Dars bali: ${lessonScore}/${lessonTasks.length * 10}\n\nBoshqa darsni tanlash uchun /vazifa ni yuboring.`
    );

    session.selectedLessonNumber = null;
    session.currentTaskIndex = 0;

    await offerNextLesson(bot, chatId, session, storage, tasks);
    return;
  }

  const task = lessonTasks[session.currentTaskIndex];
  let message = `📝 ${session.selectedLessonNumber}-dars, ${session.currentTaskIndex + 1}/${lessonTasks.length}-vazifa: ${task.title}\n\n`;
  message += `📌 Javob yuborish usullari:\n\n`;
  message += `🎤 Audio — mavzuni o'qib, ovozli xabar yuboring\n`;
  message += `📸 Rasm — daftarga tarjimasini yozib, rasmga olib yuboring\n`;
  message += `✍️ Matn — tarjimasini yozib yuboring`;

  await bot.sendMessage(Number(chatId), message, {
    reply_markup: {
      inline_keyboard: [[{ text: "⬅️ Darslar ro'yxatiga qaytish", callback_data: "back_to_lessons" }]],
    },
  });
}

async function offerNextLesson(bot: TelegramBot, chatId: string, session: any, storage: IStorage, allTasks?: any[]) {
  const tasks = allTasks || await storage.getAiTasks(session.aiClassId);
  const lessonNumbers = getLessonNumbers(tasks);
  const submissions = await storage.getAiSubmissions(session.aiStudentId);
  const completedTaskIds = new Set(submissions.filter(s => s.status === "completed").map(s => s.aiTaskId));

  for (const num of lessonNumbers) {
    const lessonTasks = tasks.filter(t => t.lessonNumber === num);
    const allDone = lessonTasks.every(t => completedTaskIds.has(t.id));
    if (!allDone) {
      await bot.sendMessage(Number(chatId), `Keyingi darsni boshlaysizmi?`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: `📝 ${num}-darsni boshlash`, callback_data: `lesson_${num}` }],
            [{ text: "⬅️ Darslar ro'yxatiga qaytish", callback_data: "back_to_lessons" }],
          ],
        },
      });
      return;
    }
  }

  const totalScore = submissions.filter(s => s.status === "completed").reduce((sum, s) => sum + (s.score || 0), 0);
  await bot.sendMessage(Number(chatId),
    `🎉 Barcha darslar topshirildi!\n📊 Umumiy ball: ${totalScore}/${tasks.length * 10}\n\nTabriklaymiz!`
  );
}

async function matchStudent(bot: TelegramBot, chatId: string, phone: string, session: any, storage: IStorage, aiClassId: string) {
  const students = await storage.getAiStudents(aiClassId);
  const matched = students.find(s => {
    const sPhone = s.phone.replace(/\D/g, "");
    return sPhone === phone || phone.endsWith(sPhone) || sPhone.endsWith(phone);
  });

  if (!matched) {
    await bot.sendMessage(Number(chatId), "❌ Siz ro'yxatda topilmadingiz. O'qituvchingizga murojaat qiling.");
    studentSessions.delete(chatId);
    return;
  }

  await storage.updateAiStudent(matched.id, { telegramChatId: chatId });
  session.aiStudentId = matched.id;
  session.awaitingPhone = false;

  await bot.sendMessage(Number(chatId),
    `✅ Xush kelibsiz, ${matched.name}!\n\nDarslarni ko'rish uchun /vazifa buyrug'ini yuboring.`,
    { reply_markup: { remove_keyboard: true } }
  );
}

function getCurrentTask(session: any, tasks: any[]) {
  if (session.selectedLessonNumber === null) return null;
  const lessonTasks = tasks
    .filter((t: any) => t.lessonNumber === session.selectedLessonNumber)
    .sort((a: any, b: any) => a.orderIndex - b.orderIndex);
  if (session.currentTaskIndex >= lessonTasks.length) return null;
  return lessonTasks[session.currentTaskIndex];
}

async function advanceToNextTask(bot: TelegramBot, chatId: string, session: any, storage: IStorage) {
  session.currentTaskIndex++;
  setTimeout(() => sendCurrentTask(bot, chatId, session, storage), 1500);
}

async function handleAudioSubmission(bot: TelegramBot, msg: TelegramBot.Message, storage: IStorage) {
  const chatId = msg.chat.id.toString();
  const session = studentSessions.get(chatId);
  if (!session || !session.aiStudentId || session.awaitingPhone) {
    await bot.sendMessage(Number(chatId), "Avval /start buyrug'ini yuboring.");
    return;
  }

  const tasks = await storage.getAiTasks(session.aiClassId);
  const task = getCurrentTask(session, tasks);
  if (!task) {
    await bot.sendMessage(Number(chatId), "Avval /vazifa buyrug'i bilan darsni tanlang.");
    return;
  }

  const existing = await storage.getAiSubmissionByStudentAndTask(session.aiStudentId, task.id);
  if (existing && existing.status === "completed") {
    await bot.sendMessage(Number(chatId), "⚠️ Bu vazifa allaqachon topshirilgan.");
    await advanceToNextTask(bot, chatId, session, storage);
    return;
  }

  const fileId = msg.voice?.file_id || msg.audio?.file_id;
  if (!fileId) return;

  await bot.sendMessage(Number(chatId), "⏳ Audio tekshirilmoqda...");

  const submission = await storage.createAiSubmission({
    aiStudentId: session.aiStudentId,
    aiTaskId: task.id,
    submissionType: "audio",
    audioFileId: fileId,
    status: "processing",
  });

  try {
    const fileLink = await bot.getFileLink(fileId);
    console.log(`[AI-BOT] Downloading audio: ${fileLink}`);
    const response = await fetch(fileLink);
    const audioBuffer = Buffer.from(await response.arrayBuffer());

    const mimeType = msg.voice?.mime_type || msg.audio?.mime_type || "";
    const filePath = (msg.voice as any)?.file_path || (msg.audio as any)?.file_name || "";
    let ext = "ogg";
    if (filePath && filePath.includes(".")) {
      ext = filePath.split(".").pop()!.toLowerCase();
    } else if (mimeType.includes("oga")) {
      ext = "oga";
    } else if (mimeType.includes("ogg")) {
      ext = "ogg";
    } else if (mimeType.includes("mp4") || mimeType.includes("m4a")) {
      ext = "m4a";
    } else if (mimeType.includes("mp3") || mimeType.includes("mpeg")) {
      ext = "mp3";
    }
    const filename = `voice.${ext}`;
    console.log(`[AI-BOT] Audio info: mime=${mimeType}, filePath=${filePath}, ext=${ext}, size=${audioBuffer.length}, filename=${filename}`);
    const transcription = await transcribeAudio(audioBuffer, filename);

    await storage.updateAiSubmission(submission.id, { transcription, status: "processing" });

    const aiClass = await storage.getAiClass(session.aiClassId);
    const result = await evaluateSubmission({
      prompt: task.prompt || undefined,
      referenceText: task.referenceText || undefined,
      studentAnswer: transcription,
      instructions: aiClass?.instructions || undefined,
      submissionType: "audio_sample",
    });

    await storage.updateAiSubmission(submission.id, {
      aiResponse: result.feedback,
      score: result.score,
      status: "completed",
      gradedAt: new Date(),
    });

    let responseMsg = `✅ ${task.title} — natija:\n\n`;
    responseMsg += `📊 Baho: ${result.score}/10\n`;
    responseMsg += `💬 Izoh: ${result.feedback}`;

    await bot.sendMessage(Number(chatId), responseMsg);
    await advanceToNextTask(bot, chatId, session, storage);
  } catch (error: any) {
    console.error("[AI-BOT] Audio submission error:", error);
    await storage.updateAiSubmission(submission.id, { status: "failed", aiResponse: error.message });
    await bot.sendMessage(Number(chatId), "❌ Xatolik yuz berdi. Qaytadan urinib ko'ring.");
  }
}

async function handleImageSubmission(bot: TelegramBot, msg: TelegramBot.Message, storage: IStorage) {
  const chatId = msg.chat.id.toString();
  const session = studentSessions.get(chatId);
  if (!session || !session.aiStudentId || session.awaitingPhone) {
    await bot.sendMessage(Number(chatId), "Avval /start buyrug'ini yuboring.");
    return;
  }

  const tasks = await storage.getAiTasks(session.aiClassId);
  const task = getCurrentTask(session, tasks);
  if (!task) {
    await bot.sendMessage(Number(chatId), "Avval /vazifa buyrug'i bilan darsni tanlang.");
    return;
  }

  const existing = await storage.getAiSubmissionByStudentAndTask(session.aiStudentId, task.id);
  if (existing && existing.status === "completed") {
    await bot.sendMessage(Number(chatId), "⚠️ Bu vazifa allaqachon topshirilgan.");
    await advanceToNextTask(bot, chatId, session, storage);
    return;
  }

  const photos = msg.photo;
  if (!photos || photos.length === 0) return;

  const largestPhoto = photos[photos.length - 1];
  const fileId = largestPhoto.file_id;

  await bot.sendMessage(Number(chatId), "⏳ Rasm tekshirilmoqda...");

  const submission = await storage.createAiSubmission({
    aiStudentId: session.aiStudentId,
    aiTaskId: task.id,
    submissionType: "image",
    imageFileId: fileId,
    status: "processing",
  });

  try {
    const fileLink = await bot.getFileLink(fileId);
    console.log(`[AI-BOT] Downloading image: ${fileLink}`);
    const response = await fetch(fileLink);
    const imageBuffer = Buffer.from(await response.arrayBuffer());

    const ocrText = ocrImage(imageBuffer);
    if (!ocrText) {
      await storage.updateAiSubmission(submission.id, { status: "failed", aiResponse: "Rasmdan matn o'qib bo'lmadi" });
      await bot.sendMessage(Number(chatId), "❌ Rasmdan matn o'qib bo'lmadi. Rasmni aniqroq olib qaytadan yuboring.");
      return;
    }

    await storage.updateAiSubmission(submission.id, { ocrText, transcription: ocrText, status: "processing" });

    const aiClass = await storage.getAiClass(session.aiClassId);
    const result = await evaluateSubmission({
      prompt: task.prompt || undefined,
      referenceText: task.referenceText || undefined,
      studentAnswer: ocrText,
      instructions: aiClass?.instructions || undefined,
      submissionType: "image",
    });

    await storage.updateAiSubmission(submission.id, {
      aiResponse: result.feedback,
      score: result.score,
      status: "completed",
      gradedAt: new Date(),
    });

    let responseMsg = `✅ ${task.title} — natija:\n\n`;
    responseMsg += `📊 Baho: ${result.score}/10\n`;
    responseMsg += `💬 Izoh: ${result.feedback}\n\n`;
    responseMsg += `📝 O'qilgan matn: "${ocrText.substring(0, 200)}${ocrText.length > 200 ? "..." : ""}"`;

    await bot.sendMessage(Number(chatId), responseMsg);
    await advanceToNextTask(bot, chatId, session, storage);
  } catch (error: any) {
    console.error("[AI-BOT] Image submission error:", error);
    await storage.updateAiSubmission(submission.id, { status: "failed", aiResponse: error.message });
    await bot.sendMessage(Number(chatId), "❌ Xatolik yuz berdi. Qaytadan urinib ko'ring.");
  }
}

async function handleTextSubmission(bot: TelegramBot, msg: TelegramBot.Message, storage: IStorage) {
  const chatId = msg.chat.id.toString();
  const session = studentSessions.get(chatId);
  if (!session || !session.aiStudentId || session.awaitingPhone) return;

  const tasks = await storage.getAiTasks(session.aiClassId);
  const task = getCurrentTask(session, tasks);
  if (!task) {
    await bot.sendMessage(Number(chatId), "Avval /vazifa buyrug'i bilan darsni tanlang.");
    return;
  }

  const existing = await storage.getAiSubmissionByStudentAndTask(session.aiStudentId, task.id);
  if (existing && existing.status === "completed") {
    await bot.sendMessage(Number(chatId), "⚠️ Bu vazifa allaqachon topshirilgan.");
    await advanceToNextTask(bot, chatId, session, storage);
    return;
  }

  const text = msg.text?.trim();
  if (!text) return;

  await bot.sendMessage(Number(chatId), "⏳ Matn tekshirilmoqda...");

  const submission = await storage.createAiSubmission({
    aiStudentId: session.aiStudentId,
    aiTaskId: task.id,
    submissionType: "text",
    transcription: text,
    status: "processing",
  });

  try {
    const aiClass = await storage.getAiClass(session.aiClassId);
    const result = await evaluateSubmission({
      prompt: task.prompt || undefined,
      referenceText: task.referenceText || undefined,
      studentAnswer: text,
      instructions: aiClass?.instructions || undefined,
      submissionType: "text",
    });

    await storage.updateAiSubmission(submission.id, {
      aiResponse: result.feedback,
      score: result.score,
      status: "completed",
      gradedAt: new Date(),
    });

    let responseMsg = `✅ ${task.title} — natija:\n\n`;
    responseMsg += `📊 Baho: ${result.score}/10\n`;
    responseMsg += `💬 Izoh: ${result.feedback}`;

    await bot.sendMessage(Number(chatId), responseMsg);
    await advanceToNextTask(bot, chatId, session, storage);
  } catch (error: any) {
    console.error("[AI-BOT] Text submission error:", error);
    await storage.updateAiSubmission(submission.id, { status: "failed", aiResponse: error.message });
    await bot.sendMessage(Number(chatId), "❌ Xatolik yuz berdi. Qaytadan urinib ko'ring.");
  }
}

export async function restoreActiveBots(storage: IStorage) {
  try {
    const allClasses = await storage.getAllActiveAiClasses();
    for (const cls of allClasses) {
      if (cls.telegramBotToken && cls.status === "active") {
        try {
          await startAiBot(cls.id, cls.telegramBotToken, storage);
          console.log(`[AI-BOT] Restored bot for class ${cls.id} (${cls.name})`);
        } catch (err: any) {
          console.error(`[AI-BOT] Failed to restore bot for class ${cls.id}:`, err.message);
        }
      }
    }
    if (allClasses.length > 0) {
      console.log(`[AI-BOT] Bot restoration complete: ${activeBots.size} bots active`);
    }
  } catch (err) {
    console.error("[AI-BOT] Bot restoration error:", err);
  }
}

export function stopAiBot(aiClassId: string) {
  const bot = activeBots.get(aiClassId);
  if (bot) {
    bot.stopPolling();
    activeBots.delete(aiClassId);
    console.log(`[AI-BOT] Bot stopped for class ${aiClassId}`);
  }
}
