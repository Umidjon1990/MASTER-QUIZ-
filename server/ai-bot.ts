import TelegramBot from "node-telegram-bot-api";
import { transcribeAudio, evaluateSubmission, ocrImage } from "./ai-service";
import type { IStorage } from "./storage";

export const activeBots = new Map<string, TelegramBot>();

const studentSessions = new Map<string, {
  aiClassId: string;
  aiStudentId: string;
  selectedTaskId: string | null;
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
        selectedTaskId: null,
        awaitingPhone: false,
      });
      await bot.sendMessage(Number(chatId), `Xush kelibsiz, ${existing.name}! Vazifalarni ko'rish uchun /vazifa buyrug'ini yuboring.`);
      return;
    }

    studentSessions.set(chatId, {
      aiClassId,
      aiStudentId: "",
      selectedTaskId: null,
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
    session.selectedTaskId = null;
    await sendTaskList(bot, chatId, session, storage);
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
    if (data?.startsWith("task_")) {
      const taskId = data.replace("task_", "");
      const existing = await storage.getAiSubmissionByStudentAndTask(session.aiStudentId, taskId);
      if (existing && existing.status === "completed") {
        await bot.answerCallbackQuery(query.id, { text: "Bu dars vazifasi allaqachon topshirilgan!" });
        return;
      }

      session.selectedTaskId = taskId;
      await bot.answerCallbackQuery(query.id);

      const tasks = await storage.getAiTasks(session.aiClassId);
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      const taskIndex = tasks.findIndex(t => t.id === taskId) + 1;
      let message = `📝 ${taskIndex}-dars: ${task.title}\n\n`;
      message += `📌 Javob yuborish usullari:\n\n`;
      message += `🎤 Audio — mavzuni o'qib, ovozli xabar yuboring\n`;
      message += `📸 Rasm — daftarga tarjimasini yozib, rasmga olib yuboring\n`;
      message += `✍️ Matn — tarjimasini yozib yuboring`;

      await bot.sendMessage(Number(chatId), message, {
        reply_markup: {
          inline_keyboard: [[{ text: "⬅️ Darslar ro'yxatiga qaytish", callback_data: "back_to_tasks" }]],
        },
      });
    } else if (data === "back_to_tasks") {
      session.selectedTaskId = null;
      await bot.answerCallbackQuery(query.id);
      await sendTaskList(bot, chatId, session, storage);
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

async function sendTaskList(bot: TelegramBot, chatId: string, session: any, storage: IStorage) {
  const tasks = await storage.getAiTasks(session.aiClassId);
  if (tasks.length === 0) {
    await bot.sendMessage(Number(chatId), "Hozircha vazifalar yo'q. O'qituvchi vazifalarni qo'shishi kerak.");
    return;
  }

  const submissions = await storage.getAiSubmissions(session.aiStudentId);
  const completedTaskIds = new Set(
    submissions.filter(s => s.status === "completed").map(s => s.aiTaskId)
  );
  const processingTaskIds = new Set(
    submissions.filter(s => s.status === "processing").map(s => s.aiTaskId)
  );

  const completedCount = tasks.filter(t => completedTaskIds.has(t.id)).length;
  const totalScore = submissions
    .filter(s => s.status === "completed")
    .reduce((sum, s) => sum + (s.score || 0), 0);

  let message = `📚 Darslar ro'yxati (${completedCount}/${tasks.length} topshirilgan)\n`;
  if (completedCount > 0) {
    message += `📊 Umumiy ball: ${totalScore}/${completedCount * 10}\n`;
  }
  message += `\nQuyidagi darslardan birini tanlang:`;

  const keyboard: TelegramBot.InlineKeyboardButton[][] = [];
  const ROW_SIZE = 3;
  for (let i = 0; i < tasks.length; i += ROW_SIZE) {
    const row: TelegramBot.InlineKeyboardButton[] = [];
    for (let j = i; j < Math.min(i + ROW_SIZE, tasks.length); j++) {
      const task = tasks[j];
      const done = completedTaskIds.has(task.id);
      const processing = processingTaskIds.has(task.id);
      let icon = "📝";
      if (done) icon = "✅";
      else if (processing) icon = "⏳";
      row.push({
        text: `${j + 1}-dars ${icon}`,
        callback_data: `task_${task.id}`,
      });
    }
    keyboard.push(row);
  }

  await bot.sendMessage(Number(chatId), message, {
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function offerNextTask(bot: TelegramBot, chatId: string, session: any, storage: IStorage) {
  const tasks = await storage.getAiTasks(session.aiClassId);
  const submissions = await storage.getAiSubmissions(session.aiStudentId);
  const completedTaskIds = new Set(
    submissions.filter(s => s.status === "completed").map(s => s.aiTaskId)
  );

  const nextTask = tasks.find(t => !completedTaskIds.has(t.id));
  if (!nextTask) {
    const totalScore = submissions
      .filter(s => s.status === "completed")
      .reduce((sum, s) => sum + (s.score || 0), 0);
    await bot.sendMessage(Number(chatId),
      `🎉 Barcha darslar topshirildi!\n📊 Umumiy ball: ${totalScore}/${tasks.length * 10}\n\nTabriklaymiz!`
    );
    session.selectedTaskId = null;
    return;
  }

  const nextIndex = tasks.findIndex(t => t.id === nextTask.id) + 1;
  session.selectedTaskId = nextTask.id;

  let message = `📝 Keyingi dars: ${nextIndex}-dars: ${nextTask.title}\n\n`;
  message += `📌 Javob yuborish usullari:\n\n`;
  message += `🎤 Audio — mavzuni o'qib, ovozli xabar yuboring\n`;
  message += `📸 Rasm — daftarga tarjimasini yozib, rasmga olib yuboring\n`;
  message += `✍️ Matn — tarjimasini yozib yuboring`;

  await bot.sendMessage(Number(chatId), message, {
    reply_markup: {
      inline_keyboard: [[{ text: "⬅️ Darslar ro'yxatiga qaytish", callback_data: "back_to_tasks" }]],
    },
  });
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
    `✅ Xush kelibsiz, ${matched.name}!\n\nVazifalarni ko'rish uchun /vazifa buyrug'ini yuboring.`,
    { reply_markup: { remove_keyboard: true } }
  );
}

async function getSelectedTask(session: any, storage: IStorage) {
  if (!session.selectedTaskId) return null;
  const tasks = await storage.getAiTasks(session.aiClassId);
  return tasks.find((t: any) => t.id === session.selectedTaskId) || null;
}

async function checkSubmissionLimit(session: any, taskId: string, storage: IStorage): Promise<boolean> {
  const existing = await storage.getAiSubmissionByStudentAndTask(session.aiStudentId, taskId);
  return !!(existing && existing.status === "completed");
}

async function handleAudioSubmission(bot: TelegramBot, msg: TelegramBot.Message, storage: IStorage) {
  const chatId = msg.chat.id.toString();
  const session = studentSessions.get(chatId);
  if (!session || !session.aiStudentId || session.awaitingPhone) {
    await bot.sendMessage(Number(chatId), "Avval /start buyrug'ini yuboring.");
    return;
  }

  const task = await getSelectedTask(session, storage);
  if (!task) {
    await bot.sendMessage(Number(chatId), "Avval /vazifa buyrug'i bilan darsni tanlang.");
    return;
  }

  const alreadyDone = await checkSubmissionLimit(session, task.id, storage);
  if (alreadyDone) {
    await bot.sendMessage(Number(chatId), "⚠️ Bu dars vazifasi allaqachon topshirilgan. Boshqa darsni tanlash uchun /vazifa ni yuboring.");
    session.selectedTaskId = null;
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
    session.selectedTaskId = null;
    await offerNextTask(bot, chatId, session, storage);
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

  const task = await getSelectedTask(session, storage);
  if (!task) {
    await bot.sendMessage(Number(chatId), "Avval /vazifa buyrug'i bilan darsni tanlang.");
    return;
  }

  const alreadyDone = await checkSubmissionLimit(session, task.id, storage);
  if (alreadyDone) {
    await bot.sendMessage(Number(chatId), "⚠️ Bu dars vazifasi allaqachon topshirilgan. Boshqa darsni tanlash uchun /vazifa ni yuboring.");
    session.selectedTaskId = null;
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
    session.selectedTaskId = null;
    await offerNextTask(bot, chatId, session, storage);
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

  const task = await getSelectedTask(session, storage);
  if (!task) {
    await bot.sendMessage(Number(chatId), "Avval /vazifa buyrug'i bilan darsni tanlang.");
    return;
  }

  const alreadyDone = await checkSubmissionLimit(session, task.id, storage);
  if (alreadyDone) {
    await bot.sendMessage(Number(chatId), "⚠️ Bu dars vazifasi allaqachon topshirilgan. Boshqa darsni tanlash uchun /vazifa ni yuboring.");
    session.selectedTaskId = null;
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
    session.selectedTaskId = null;
    await offerNextTask(bot, chatId, session, storage);
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
