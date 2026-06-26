const fs = require("node:fs/promises");
const path = require("node:path");

const TELEGRAM_API_BASE = "https://api.telegram.org";
const TELEGRAM_FILE_STORAGE_ROOT =
  process.env.SHOWCASE_TELEGRAM_FILE_STORAGE_ROOT || path.join(__dirname, "runtime", "telegram-files");

function sanitizeFileName(value) {
  if (!value) {
    return value;
  }
  return value
    .toString()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 200);
}

async function downloadTelegramAttachment(bot, attachment) {
  if (!bot?.token || !attachment?.telegramFileId) {
    return null;
  }

  try {
    const fileInfoResponse = await fetch(
      `${TELEGRAM_API_BASE}/bot${bot.token}/getFile?file_id=${attachment.telegramFileId}`,
    );
    const fileInfo = await fileInfoResponse.json();
    if (!fileInfoResponse.ok || fileInfo.ok === false) {
      throw new Error(fileInfo.description || fileInfoResponse.statusText);
    }
    const filePath = fileInfo.result?.file_path;
    if (!filePath) {
      return null;
    }

    const storageDir = path.join(TELEGRAM_FILE_STORAGE_ROOT, attachment.telegramFileId);
    await fs.mkdir(storageDir, { recursive: true });
    const sourceName = attachment.fileName || path.basename(filePath);
    const safeName = sanitizeFileName(sourceName) || attachment.telegramFileId;
    const targetPath = path.join(storageDir, safeName);

    try {
      await fs.stat(targetPath);
      return {
        filePath: targetPath,
        fileName: safeName,
        mimeType: attachment.mimeType || "application/octet-stream",
      };
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    const downloadResponse = await fetch(`${TELEGRAM_API_BASE}/file/bot${bot.token}/${filePath}`);
    if (!downloadResponse.ok) {
      throw new Error(
        `Telegram file download failed (${downloadResponse.status}): ${downloadResponse.statusText}`,
      );
    }

    const buffer = Buffer.from(await downloadResponse.arrayBuffer());
    await fs.writeFile(targetPath, buffer);

    return {
      filePath: targetPath,
      fileName: safeName,
      mimeType: downloadResponse.headers.get("content-type") || "application/octet-stream",
    };
  } catch (error) {
    console.warn(
      `Failed to download Telegram attachment ${attachment.fileName || attachment.telegramFileId}: ${error.message}`,
    );
    return null;
  }
}

async function downloadTelegramAttachments(bot, attachments) {
  const map = new Map();
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return map;
  }

  for (const attachment of attachments) {
    if (!attachment?.telegramFileId) {
      continue;
    }
    try {
      const downloaded = await downloadTelegramAttachment(bot, attachment);
      if (downloaded?.filePath) {
        map.set(attachment.telegramFileId, downloaded);
      }
    } catch (error) {
      console.warn(
        `Failed to download Telegram attachment ${attachment.fileName || attachment.telegramFileId}: ${error.message}`,
      );
    }
  }

  return map;
}

module.exports = {
  downloadTelegramAttachment,
  downloadTelegramAttachments,
  sanitizeFileName,
  TELEGRAM_FILE_STORAGE_ROOT,
};
