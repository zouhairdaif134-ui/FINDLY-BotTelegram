export function resolveMovieMediaTitleId(media, title) {
  return title?.id || media?.titleId || null;
}

export function normalizeMovieTitle(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function findMovieMediaTitle(titles, media) {
  if (!Array.isArray(titles) || !media?.title || !Number.isInteger(media.releaseYear)) return null;
  const target = normalizeMovieTitle(media.title);
  if (!target) return null;
  const matches = titles.filter((title) =>
    Number(title.release_year) === media.releaseYear &&
    (!media.mediaType || title.media_type === media.mediaType) &&
    normalizeMovieTitle(title.title) === target
  );
  return matches.length === 1 ? matches[0] : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseMovieStorageCaption(caption) {
  const raw = String(caption || "").trim();
  const parts = raw.split("|").map((part) => part.trim());
  const reference = parts[0]?.replace(/^FINDLY:/i, "").trim();
  if (!reference || !/^FINDLY:/i.test(parts[0])) return null;

  // Series episodes use: FINDLY:<SERIES_UUID>|S01E01|1080p
  if (UUID_RE.test(reference) && parts.length === 3) {
    const episodeMatch = /^S(\d{2})E(\d{2,3})$/i.exec(parts[1] || "");
    const quality = String(parts[2] || "").trim().slice(0, 24);
    if (!episodeMatch || !quality) return null;
    const seasonNumber = Number(episodeMatch[1]);
    const episodeNumber = Number(episodeMatch[2]);
    if (episodeNumber < 1) return null;
    return {
      titleId: reference, title: null, releaseYear: null, quality,
      seasonNumber, episodeNumber
    };
  }

  // Existing movie format remains unchanged: FINDLY:<UUID>|1080p
  if (UUID_RE.test(reference) && parts.length <= 2) {
    const quality = String(parts[1] || "Original").trim().slice(0, 24) || "Original";
    return { titleId: reference, title: null, releaseYear: null, quality };
  }

  const titleMatch = /^(.+?)\s*\((18\d{2}|19\d{2}|20\d{2}|21\d{2}|2200)\)$/.exec(reference);
  if (!titleMatch || !titleMatch[1].trim()) return null;

  // Title-based series episodes use: FINDLY:<SERIES TITLE> (<YEAR>)|S01E01|1080p
  if (parts.length === 3) {
    const episodeMatch = /^S(\d{2})E(\d{2,3})$/i.exec(parts[1] || "");
    const seasonNumber = Number(episodeMatch?.[1]);
    const episodeNumber = Number(episodeMatch?.[2]);
    const quality = String(parts[2] || "").trim().slice(0, 24);
    if (!episodeMatch || seasonNumber < 1 || episodeNumber < 1 || !quality) return null;
    return {
      titleId: null, title: titleMatch[1].trim(),
      releaseYear: Number(titleMatch[2]), quality,
      seasonNumber, episodeNumber, mediaType: "series"
    };
  }

  if (parts.length > 2) return null;
  return {
    titleId: null, title: titleMatch[1].trim(),
    releaseYear: Number(titleMatch[2]),
    quality: String(parts[1] || "Original").trim().slice(0, 24) || "Original",
    mediaType: "movie"
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
    videoWidth: Number.isSafeInteger(file.width) && file.width > 0 ? file.width : null,
    videoHeight: Number.isSafeInteger(file.height) && file.height > 0 ? file.height : null,
    durationSeconds: Number.isSafeInteger(file.duration) && file.duration > 0 ? file.duration : null,
    titleId: link.titleId,
    title: link.title,
    releaseYear: link.releaseYear,
    contentType: link.mediaType || (link.seasonNumber != null ? "series" : "movie"),
    seasonNumber: link.seasonNumber ?? null,
    episodeNumber: link.episodeNumber ?? null,
    quality: link.quality
  };
}

export function getTelegramMediaDelivery(mediaType) {
  const deliveries = {
    video: { method: "sendVideo", field: "video" },
    document: { method: "sendDocument", field: "document" },
    audio: { method: "sendAudio", field: "audio" },
    animation: { method: "sendAnimation", field: "animation" }
  };
  return deliveries[mediaType] || null;
}

export function canDistributeMovieMedia(rightsStatus) {
  return rightsStatus === "authorized";
}

export function getStorageChatIdForContentType(config, contentType) {
  if (contentType === "series") return config?.series_storage_chat_id || null;
  if (contentType === "movie") return config?.active_storage_chat_id || null;
  return null;
}

export function isActiveMovieStorageChannel(messageChatId, activeStorageChatId) {
  return Boolean(activeStorageChatId) && String(messageChatId) === String(activeStorageChatId);
}

export function isAllowedMovieMediaStatusTransition(currentStatus, nextStatus) {
  const transitions = {
    pending_review: ["active", "rejected"],
    active: ["inactive"],
    inactive: [],
    rejected: []
  };
  return Boolean(transitions[currentStatus]?.includes(nextStatus));
}


export function canApproveMovieMediaAsset(asset) {
  return asset?.media_type === "video";
}
