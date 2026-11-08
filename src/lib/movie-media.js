const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseMovieStorageCaption(caption) {
  const match = /^\s*FINDLY:([0-9a-f-]{36})(?:\s*\|\s*(.{1,24}))?\s*$/i.exec(String(caption || ""));
  if (!match || !UUID_RE.test(match[1])) return null;
  return {
    titleId: match[1],
    quality: String(match[2] || "Original").trim().slice(0, 24) || "Original"
  };
}

export function extractTelegramMedia(channelPost) {
  if (!channelPost?.chat?.id || !Number.isSafeInteger(channelPost.message_id)) return null;
  const link = parseMovieStorageCaption(channelPost.caption);
  if (!link) return null;

  const candidates = [
    ["video", channelPost.video],
    ["document", channelPost.document],
    ["audio", channelPost.audio],
    ["animation", channelPost.animation]
  ];
  const selected = candidates.find(([, file]) => file?.file_id && file?.file_unique_id);
  if (!selected) return null;

  const [mediaType, file] = selected;
  return {
    chatId: String(channelPost.chat.id),
    messageId: channelPost.message_id,
    mediaType,
    fileId: file.file_id,
    fileUniqueId: file.file_unique_id,
    fileSize: Number.isSafeInteger(file.file_size) ? file.file_size : null,
    fileName: file.file_name || null,
    mimeType: file.mime_type || null,
    titleId: link.titleId,
    quality: link.quality
  };
}
