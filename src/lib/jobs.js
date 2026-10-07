import { getSupabase } from "./supabase.js";

export const JOB_SOURCE_SLUGS = Object.freeze({
  ADDWORK: "addwork",
  ANAPEC: "anapec"
});

const CITY_ALIASES = new Map([
  ["berrechid", "Berrechid"],
  ["berrechid city", "Berrechid"],
  ["berrechid, maroc", "Berrechid"],
  ["berrechid, morocco", "Berrechid"],
  ["settat", "Settat"],
  ["casablanca", "Casablanca"],
  ["casablanca- settat", "Casablanca-Settat"],
  ["casablanca-settat", "Casablanca-Settat"],
  ["el jadida", "El Jadida"],
  ["mohammedia", "Mohammedia"],
  ["bouskoura", "Bouskoura"],
  ["mediouna", "Mediouna"],
  ["nouaceur", "Nouaceur"],
  ["benslimane", "Benslimane"]
]);

const REGION_ALIASES = new Map([
  ["casablanca-settat", "Casablanca-Settat"],
  ["casablanca settat", "Casablanca-Settat"],
  ["grand casablanca", "Casablanca-Settat"]
]);

function cleanText(value) {
  if (value === null || value === undefined) return null;

  const text = String(value)
    .replace(/\s+/g, " ")
    .trim();

  return text || null;
}

function firstValue(...values) {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (cleaned) return cleaned;
  }

  return null;
}

function parseDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function normalizeKey(value) {
  return cleanText(value)
    ?.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim() || "";
}

export function normalizeCity(value) {
  const key = normalizeKey(value);

  if (!key) return null;

  return CITY_ALIASES.get(key) || cleanText(value);
}

export function normalizeRegion(value) {
  const key = normalizeKey(value);

  if (!key) return null;

  return REGION_ALIASES.get(key) || cleanText(value);
}

export function classifyJob(job) {
  const location = normalizeKey(
    [job.location_text, job.city, job.region].filter(Boolean).join(" ")
  );

  const isBerrechid = location.includes("berrechid");
  const isSettat = location.includes("settat");
  const isCasablancaSettat =
    isBerrechid ||
    isSettat ||
    location.includes("casablanca") ||
    location.includes("bouskoura") ||
    location.includes("mohammedia") ||
    location.includes("mediouna") ||
    location.includes("nouaceur") ||
    location.includes("benslimane") ||
    location.includes("el jadida");

  return {
    priority_city: isBerrechid
      ? "Berrechid"
      : isSettat
        ? "Settat"
        : null,
    target_region: isCasablancaSettat
      ? "Casablanca-Settat"
      : normalizeRegion(job.region)
  };
}

export function normalizeJob(source, raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Job source item must be an object");
  }

  const title = firstValue(
    raw.title,
    raw.name,
    raw.position,
    raw.job_title,
    raw.jobTitle
  );

  const sourceUrl = firstValue(
    raw.source_url,
    raw.sourceUrl,
    raw.url,
    raw.link,
    raw.href
  );

  if (!title) {
    throw new Error("Job title is required");
  }

  if (!sourceUrl) {
    throw new Error("Job source_url is required");
  }

  const locationText = firstValue(
    raw.location_text,
    raw.location,
    raw.city,
    raw.address,
    raw.localisation
  );

  const city = normalizeCity(
    firstValue(raw.city, raw.location_city, raw.locationCity)
  );

  const region = normalizeRegion(
    firstValue(raw.region, raw.location_region, raw.locationRegion)
  );

  const normalized = {
    source_job_id: firstValue(
      raw.source_job_id,
      raw.sourceJobId,
      raw.id,
      raw.job_id,
      raw.jobId
    ),
    title,
    company: firstValue(
      raw.company,
      raw.company_name,
      raw.companyName,
      raw.employer
    ),
    location_text: locationText,
    city,
    region,
    description: firstValue(
      raw.description,
      raw.summary,
      raw.excerpt
    ),
    employment_type: firstValue(
      raw.employment_type,
      raw.employmentType,
      raw.contract_type,
      raw.contractType
    ),
    published_at: parseDate(
      raw.published_at ||
      raw.publishedAt ||
      raw.date_published ||
      raw.datePublished ||
      raw.created_at ||
      raw.createdAt
    ),
    expires_at: parseDate(
      raw.expires_at ||
      raw.expiresAt ||
      raw.expiry_date ||
      raw.expiryDate
    ),
    source_url: sourceUrl,
    apply_url: firstValue(
      raw.apply_url,
      raw.applyUrl,
      raw.application_url,
      raw.applicationUrl
    ) || sourceUrl,
    raw_data: raw,
    source_slug: source.slug
  };

  return {
    ...normalized,
    ...classifyJob(normalized)
  };
}

export async function createJobFingerprint(job) {
  const canonical = [
    job.source_slug,
    job.source_job_id || "",
    normalizeKey(job.title),
    normalizeKey(job.company),
    normalizeKey(job.location_text),
    job.source_url
  ].join("|");

  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(value) {
  return decodeXmlEntities(
    String(value || "")
      .replace(/<!\[CDATA\[/g, "")
      .replace(/\]\]>/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function readXmlTag(block, tag) {
  const pattern = new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`,
    "i"
  );

  return block.match(pattern)?.[1] || null;
}

export function parseRssFeed(xml) {
  const items = [];
  const blocks = String(xml || "").match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [];

  for (const block of blocks) {
    const title = stripTags(readXmlTag(block, "title"));
    const link = stripTags(readXmlTag(block, "link"));
    const description = stripTags(readXmlTag(block, "description"));
    const guid = stripTags(readXmlTag(block, "guid"));
    const pubDate = stripTags(
      readXmlTag(block, "pubDate") ||
      readXmlTag(block, "published") ||
      readXmlTag(block, "updated")
    );

    if (!title || !link) continue;

    items.push({
      id: guid || link,
      title,
      link,
      description,
      published_at: pubDate
    });
  }

  return items;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Source request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchJsonSource(source) {
  if (!source.feed_url) {
    throw new Error(`Source ${source.slug} has no feed_url`);
  }

  const response = await fetchWithTimeout(source.feed_url, {
    headers: {
      accept: "application/json",
      "user-agent": "FINDLY-Jobs/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Source ${source.slug} returned HTTP ${response.status}`
    );
  }

  const payload = await response.json();

  if (Array.isArray(payload)) return payload;

  if (Array.isArray(payload.jobs)) return payload.jobs;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.results)) return payload.results;

  throw new Error(
    `Source ${source.slug} JSON response does not contain a jobs array`
  );
}

async function fetchRssSource(source) {
  if (!source.feed_url) {
    throw new Error(`Source ${source.slug} has no feed_url`);
  }

  const response = await fetch(source.feed_url, {
    headers: {
      accept: "application/rss+xml, application/xml, text/xml",
      "user-agent": "FINDLY-Jobs/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Source ${source.slug} returned HTTP ${response.status}`
    );
  }

  return parseRssFeed(await response.text());
}

function htmlToText(value) {
  return decodeXmlEntities(
    String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>(?=.)/gi, "\n")
      .replace(/<\/(p|div|li|section|article|h1|h2|h3|h4|h5|h6)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n")
  );
}

function parseJsonLdJobs(html, source) {
  const jobs = [];
  const scripts = String(html || "").match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi
  ) || [];

  for (const script of scripts) {
    const body = script
      .replace(/^<script[^>]*>/i, "")
      .replace(/<\/script>$/i, "")
      .trim();

    try {
      const data = JSON.parse(body);
      const nodes = Array.isArray(data)
        ? data
        : Array.isArray(data["@graph"])
          ? data["@graph"]
          : [data];

      for (const node of nodes) {
        if (node?.["@type"] !== "JobPosting") continue;

        jobs.push({
          source_job_id: node.identifier?.value || node.identifier || node.url || node["@id"] || null,
          title: node.title,
          company: node.hiringOrganization?.name || null,
          location_text:
            node.jobLocation?.address?.addressLocality ||
            node.jobLocation?.address?.streetAddress ||
            node.jobLocation?.name ||
            null,
          city: node.jobLocation?.address?.addressLocality || null,
          description: node.description || null,
          employment_type: node.employmentType || null,
          published_at: node.datePosted || null,
          expires_at: node.validThrough || null,
          source_url: node.url || source.base_url,
          apply_url: node.url || source.base_url
        });
      }
    } catch {
      continue;
    }
  }

  return jobs;
}

function parseAddworkCards(plainText, source) {
  const lines = String(plainText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const jobs = [];
  const seen = new Set();

  for (let i = 3; i < lines.length; i += 1) {
    if (!/^Voir l['’]offre\b/i.test(lines[i])) continue;

    const description = lines[i - 1];
    const location = lines[i - 2];
    const title = lines[i - 3];

    if (
      !title || title.length < 4 || title.length > 180 ||
      !location || location.length > 60 ||
      !description || description.length < 20
    ) {
      continue;
    }

    const key = `${normalizeKey(title)}|${normalizeKey(location)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    jobs.push({
      source_job_id: `addwork:${normalizeKey(title)}:${normalizeKey(location)}`,
      title,
      company: "ADDWORK",
      location_text: location,
      city: location,
      description: description.slice(0, 5000),
      source_url: source.base_url,
      apply_url: source.base_url
    });
  }

  return jobs;
}

function extractAddworkOfferLinks(html) {
  const links = [];
  const seen = new Set();

  for (const match of String(html || "").matchAll(
    /href=["'](?:https?:\/\/www\.addwork\.ma)?(\/nos-opportunites\/[a-z0-9][a-z0-9-]*)["']/gi
  )) {
    const url = `https://www.addwork.ma${match[1]}`;
    if (seen.has(url)) continue;
    seen.add(url);
    links.push(url);
  }

  return links;
}

function parseAddworkPageCards(html, source) {
  const cards = parseAddworkCards(htmlToText(html), source);
  const links = extractAddworkOfferLinks(html);

  if (links.length === cards.length) {
    cards.forEach((card, index) => {
      card.source_url = links[index];
      card.apply_url = links[index];
    });
  }

  return cards;
}

function parseAddworkHtml(html, source) {
  const jsonLdJobs = parseJsonLdJobs(html, source);
  if (jsonLdJobs.length) return jsonLdJobs;

  const page = String(html || "");

  if (!page.trim()) {
    throw new Error("ADDWORK returned an empty HTML response");
  }

  const plainText = htmlToText(page);
  const normalizedPageText = normalizeKey(plainText);

  const hasJobsSection =
    normalizedPageText.includes(normalizeKey("Nos opportunités au Maroc")) ||
    normalizedPageText.includes(normalizeKey("Nos offres au Maroc")) ||
    normalizedPageText.includes(normalizeKey("ADDWORK recrute"));

  if (!hasJobsSection) {
    const preview = cleanText(plainText)?.slice(0, 160) || "empty";
    throw new Error(
      `ADDWORK jobs page structure was not recognized: ${preview}`
    );
  }

  const cardJobs = parseAddworkPageCards(page, source);
  if (cardJobs.length >= 3) return cardJobs;

  // ADDWORK has used multiple heading levels and may wrap heading content
  // with attributes/classes. Capture every semantic heading level instead of
  // assuming only h2/h3.
  const headingMatches = [
    ...page.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)
  ];

  const jobs = [];
  const locationCandidates = [
    "Berrechid",
    "Settat",
    "Casablanca",
    "Kénitra",
    "Kenitra",
    "Dar Bouazza",
    "Marrakech",
    "Rabat",
    "Mohammedia",
    "El Jadida",
    "Bouskoura",
    "Médiouna",
    "Mediouna",
    "Nouaceur",
    "Benslimane",
    "Tanger",
    "Fès",
    "Fes",
    "Meknès",
    "Meknes",
    "Tétouan",
    "Tetouan",
    "Nador",
    "Laâyoune",
    "Dakhla"
  ];

  const ignoredTitles = new Set([
    "ADDWORK recrute",
    "Nos offres au Maroc",
    "Nos opportunités au Maroc",
    "Des opportunités dans tout le Maroc",
    "Votre parcours mérite",
    "Une équipe à votre écoute",
    "Relation client & centres d’appels",
    "Relation client & centres d'appels",
    "Systèmes d’information",
    "Systèmes d'information",
    "Industrie agroalimentaire",
    "Distribution automobile",
    "Hôtellerie",
    "Profils commerciaux et support",
    "Explorer",
    "Échangeons sur vos projets",
    "Echangeons sur vos projets",
    "Partager mon profil",
    "Déposer ma candidature",
    "Découvrir l’offre",
    "Découvrir l'offre",
    "Envoyer mon CV",
    "Postuler par e-mail"
  ].map(normalizeKey));

  const nonJobTitlePatterns = [
    /^explorer$/i,
    /^échangeons\s+sur\s+vos\s+projets$/i,
    /^echangeons\s+sur\s+vos\s+projets$/i,
    /^partager\s+mon\s+profil$/i,
    /^déposer\s+ma\s+candidature$/i,
    /^deposer\s+ma\s+candidature$/i,
    /^découvrir\s+l['’]offre$/i,
    /^decouvrir\s+l['’]offre$/i,
    /^envoyer\s+mon\s+cv$/i,
    /^postuler\s+par\s+e-mail$/i
  ];

  for (let index = 0; index < headingMatches.length; index += 1) {
    const match = headingMatches[index];
    const title = stripTags(match[1]);
    const normalizedTitle = normalizeKey(title);

    if (
      !title ||
      ignoredTitles.has(normalizedTitle) ||
      nonJobTitlePatterns.some((pattern) => pattern.test(title))
    ) {
      continue;
    }

    const blockStart = match.index + match[0].length;
    const blockEnd =
      index + 1 < headingMatches.length
        ? headingMatches[index + 1].index
        : page.length;

    const block = page.slice(blockStart, blockEnd);
    const text = htmlToText(block);

    if (!text) continue;

    const normalizedBlock = normalizeKey(text);
    const hasApplicationAction =
      /\b(Découvrir l’offre|Découvrir l'offre|Déposer ma candidature|Envoyer mon CV|Postuler par e-mail)\b/i.test(
        text
      );
    const hasRecruitmentSignal = /\bADDWORK recrute\b/i.test(text);
    const hasKnownLocation = locationCandidates.some((city) =>
      normalizedBlock.includes(normalizeKey(city))
    );

    const looksLikeVacancy =
      hasApplicationAction || (hasRecruitmentSignal && hasKnownLocation);

    if (!looksLikeVacancy) continue;

    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const locationLine =
      lines.find((line) =>
        locationCandidates.some((city) =>
          normalizeKey(line).includes(normalizeKey(city))
        )
      ) || null;

    const detectedCity =
      locationCandidates.find((city) =>
        normalizeKey(locationLine).includes(normalizeKey(city))
      ) || null;

    const description = lines
      .filter((line) => line !== locationLine)
      .filter((line) => !/^Déposer ma candidature/i.test(line))
      .filter((line) => !/^Découvrir l’offre/i.test(line))
      .filter((line) => !/^Envoyer mon CV/i.test(line))
      .filter((line) => !/^Postuler par e-mail/i.test(line))
      .filter((line) => !/^Partager mon profil/i.test(line))
      .join("\n")
      .slice(0, 5000);

    const sourceJobId = `addwork:${normalizeKey(title)}:${normalizeKey(locationLine || "maroc")}`;

    jobs.push({
      source_job_id: sourceJobId,
      title,
      company: "ADDWORK",
      location_text: locationLine,
      city: detectedCity,
      description: description || null,
      source_url: source.base_url,
      apply_url: source.base_url
    });
  }

  // Some ADDWORK deployments render job cards as divs/articles rather than
  // semantic headings. When the heading parser finds nothing, fall back to the
  // visible text structure: location/category line -> job title -> recruitment
  // or application text. This keeps the connector independent of CSS classes.
  if (jobs.length === 0) {
    const lines = plainText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const isIgnoredLine = (line) => {
      const normalized = normalizeKey(line);

      return (
        !normalized ||
        ignoredTitles.has(normalized) ||
        nonJobTitlePatterns.some((pattern) => pattern.test(line)) ||
        /^(relation client|systèmes? d['’]information|industrie agroalimentaire|distribution automobile|hôtellerie|profils commerciaux et support)$/i.test(
          line
        ) ||
        /^(pour postuler|votre mission|vos responsabilités|profil recherché|pour postuler)$/i.test(
          line
        )
      );
    };

    const findLocation = (windowLines) =>
      windowLines.find((line) =>
        locationCandidates.some((city) =>
          normalizeKey(line).includes(normalizeKey(city))
        )
      ) || null;

    const addTextJob = (title, windowLines) => {
      const cleanTitle = cleanText(title);

      if (
        !cleanTitle ||
        isIgnoredLine(cleanTitle) ||
        cleanTitle.length < 4 ||
        cleanTitle.length > 180
      ) {
        return;
      }

      const locationLine = findLocation(windowLines);
      const normalizedWindow = normalizeKey(windowLines.join(" "));
      const hasApplicationAction =
        /\b(Découvrir l’offre|Découvrir l'offre|Déposer ma candidature|Envoyer mon CV|Postuler par e-mail)\b/i.test(
          windowLines.join(" ")
        );
      const hasRecruitmentSignal = /\bADDWORK recrute\b/i.test(
        windowLines.join(" ")
      );

      if (!locationLine || (!hasApplicationAction && !hasRecruitmentSignal)) {
        return;
      }

      const detectedCity =
        locationCandidates.find((city) =>
          normalizeKey(locationLine).includes(normalizeKey(city))
        ) || null;

      const description = windowLines
        .filter((line) => line !== locationLine)
        .filter((line) => !/^ADDWORK recrute/i.test(line))
        .filter((line) => !/^Pour postuler/i.test(line))
        .filter((line) => !/^Découvrir l['’]offre/i.test(line))
        .filter((line) => !/^Déposer ma candidature/i.test(line))
        .filter((line) => !/^Envoyer mon CV/i.test(line))
        .filter((line) => !/^Postuler par e-mail/i.test(line))
        .join("\n")
        .slice(0, 5000);

      const sourceJobId = `addwork:${normalizeKey(cleanTitle)}:${normalizeKey(
        locationLine
      )}`;

      if (
        jobs.some(
          (job) =>
            job.source_job_id === sourceJobId ||
            normalizeKey(job.title) === normalizeKey(cleanTitle)
        )
      ) {
        return;
      }

      jobs.push({
        source_job_id: sourceJobId,
        title: cleanTitle,
        company: "ADDWORK",
        location_text: locationLine,
        city: detectedCity,
        description: description || null,
        source_url: source.base_url,
        apply_url: source.base_url
      });
    };

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (isIgnoredLine(line)) continue;

      const forwardWindow = lines.slice(index + 1, index + 9);
      const localWindow = lines.slice(Math.max(0, index - 2), index + 9);
      const nextLine = lines[index + 1] || "";

      // Pattern 1: location/category line followed by the job title and then
      // ADDWORK/application text.
      const currentHasLocation = locationCandidates.some((city) =>
        normalizeKey(line).includes(normalizeKey(city))
      );
      if (currentHasLocation && nextLine && !isIgnoredLine(nextLine)) {
        addTextJob(nextLine, forwardWindow);
      }

      // Pattern 2: title followed by location and recruitment/application text.
      addTextJob(line, localWindow);
    }
  }

  if (jobs.length === 0) {
    throw new Error(
      `ADDWORK jobs page was recognized but no job headings were found (headings=${headingMatches.length}, textLength=${plainText.length})`
    );
  }

  return jobs;
}

async function fetchAddworkJobs(source, firstPageHtml, firstPageUrl) {
  const jobs = [...parseAddworkHtml(firstPageHtml, source)];
  const seen = new Set(jobs.map((job) => job.source_job_id));

  const pageNumbers = [
    ...String(firstPageHtml).matchAll(/[?&;]page=(\d+)/gi)
  ].map((match) => Number(match[1]));

  const lastPage = Math.min(Math.max(1, ...pageNumbers), 10);

  for (let page = 2; page <= lastPage; page += 1) {
    const pageUrl = new URL(firstPageUrl);
    pageUrl.searchParams.set("page", String(page));

    const response = await fetchWithTimeout(pageUrl.toString(), {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "FINDLY-Jobs/1.0"
      }
    });

    if (!response.ok) {
      throw new Error(`ADDWORK page ${page} returned HTTP ${response.status}`);
    }

    const pageJobs = parseAddworkPageCards(await response.text(), source);

    if (pageJobs.length === 0) {
      throw new Error(`ADDWORK page ${page} returned no jobs`);
    }

    for (const job of pageJobs) {
      if (seen.has(job.source_job_id)) continue;
      seen.add(job.source_job_id);
      jobs.push(job);
    }
  }

  return jobs;
}

async function fetchHtmlSource(source) {
  const url = source.feed_url || source.base_url;

  if (!url) {
    throw new Error(`Source ${source.slug} has no base_url/feed_url`);
  }

  const response = await fetchWithTimeout(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "FINDLY-Jobs/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Source ${source.slug} returned HTTP ${response.status}`
    );
  }

  const html = await response.text();

  if (source.slug === JOB_SOURCE_SLUGS.ADDWORK) {
    return fetchAddworkJobs(source, html, url);
  }

  throw new Error(`HTML connector is not configured for source ${source.slug}`);
}

export async function fetchSourceJobs(source) {
  switch (source.source_type) {
    case "json":
      return fetchJsonSource(source);
    case "rss":
      return fetchRssSource(source);
    case "html":
      return fetchHtmlSource(source);
    default:
      throw new Error(
        `Source ${source.slug} is not technically configured yet`
      );
  }
}

export async function loadEnabledJobSources(env) {
  const supabase = getSupabase(env);

  const { data, error } = await supabase
    .from("job_sources")
    .select("*")
    .eq("enabled", true)
    .eq("auto_sync", true)
    .order("slug", { ascending: true });

  if (error) throw error;

  const now = Date.now();

  return (data || []).filter((source) => {
    if (!source.last_synced_at) return true;

    const intervalMs =
      Math.max(5, Number(source.sync_interval_minutes) || 1440) *
      60 *
      1000;

    return now - new Date(source.last_synced_at).getTime() >= intervalMs;
  });
}

async function expireKnownJobs(env) {
  const supabase = getSupabase(env);
  const now = new Date();
  const staleCutoff = new Date(
    now.getTime() - 3 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { error: explicitExpiryError } = await supabase
    .from("jobs")
    .update({
      status: "expired"
    })
    .eq("status", "active")
    .lt("expires_at", now.toISOString());

  if (explicitExpiryError) throw explicitExpiryError;

  const { error: staleExpiryError } = await supabase
    .from("jobs")
    .update({
      status: "expired"
    })
    .eq("status", "active")
    .not("last_seen_at", "is", null)
    .lt("last_seen_at", staleCutoff);

  if (staleExpiryError) throw staleExpiryError;
}

export async function syncJobSource(env, source) {
  const supabase = getSupabase(env);
  const startedAt = new Date().toISOString();

  const { data: run, error: runError } = await supabase
    .from("job_sync_runs")
    .insert({
      source_id: source.id,
      started_at: startedAt,
      status: "running"
    })
    .select("id")
    .single();

  if (runError) throw runError;

  let fetchedCount = 0;
  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const skipReasons = [];

  try {
    const rawJobs = await fetchSourceJobs(source);
    fetchedCount = rawJobs.length;

    const { data: existingRows, error: existingError } = await supabase
      .from("jobs")
      .select("id, source_job_id, fingerprint")
      .eq("source_id", source.id);

    if (existingError) throw existingError;

    const existingBySourceJobId = new Map();
    const existingByFingerprint = new Map();

    for (const row of existingRows || []) {
      if (row.source_job_id) {
        existingBySourceJobId.set(row.source_job_id, row.id);
      }
      if (row.fingerprint) {
        existingByFingerprint.set(row.fingerprint, row.id);
      }
    }

    for (const raw of rawJobs) {
      let job;

      try {
        job = normalizeJob(source, raw);
      } catch (error) {
        skippedCount += 1;
        skipReasons.push(
          `normalize: ${raw?.title || "?"}: ${error?.message || "invalid"}`
        );
        console.warn("Job normalization skipped item:", {
          source: source.slug,
          message: error?.message || "Invalid job"
        });
        continue;
      }

      job.fingerprint = await createJobFingerprint(job);

      const payload = {
        source_id: source.id,
        source_job_id: job.source_job_id,
        fingerprint: job.fingerprint,
        title: job.title,
        company: job.company,
        location_text: job.location_text,
        city: job.city,
        region: job.region,
        priority_city: job.priority_city,
        target_region: job.target_region,
        description: job.description,
        employment_type: job.employment_type,
        published_at: job.published_at,
        expires_at: job.expires_at,
        source_url: job.source_url,
        apply_url: job.apply_url,
        raw_data: job.raw_data,
        status: "active",
        last_seen_at: new Date().toISOString()
      };

      const existingId =
        (job.source_job_id && existingBySourceJobId.get(job.source_job_id)) ||
        existingByFingerprint.get(job.fingerprint) ||
        null;

      if (existingId) {
        const { error } = await supabase
          .from("jobs")
          .update(payload)
          .eq("id", existingId);

        if (error) throw error;

        updatedCount += 1;
      } else {
        const { error } = await supabase
          .from("jobs")
          .insert({
            ...payload,
            first_seen_at: new Date().toISOString()
          });

        if (error?.code === "23505") {
          skippedCount += 1;
          skipReasons.push(
            `insert23505: ${job.title}: ${error.message} | ${error.details || ""}`
          );
          continue;
        }

        if (error) throw error;

        insertedCount += 1;
      }
    }

    const completedAt = new Date().toISOString();
    const isFullySkipped =
      fetchedCount > 0 && skippedCount === fetchedCount;
    const runStatus = isFullySkipped ? "partial" : "success";

    const { error: runUpdateError } = await supabase
      .from("job_sync_runs")
      .update({
        completed_at: completedAt,
        status: runStatus,
        fetched_count: fetchedCount,
        inserted_count: insertedCount,
        updated_count: updatedCount,
        skipped_count: skippedCount,
        error_message: skipReasons.length
          ? skipReasons.slice(0, 6).join(" || ").slice(0, 3000)
          : null
      })
      .eq("id", run.id);

    if (runUpdateError) {
      throw new Error(
        `Failed to finalize job sync run ${run.id}: ${runUpdateError.message}`
      );
    }

    const { error: sourceUpdateError } = await supabase
      .from("job_sources")
      .update({
        last_synced_at: completedAt,
        last_success_at: isFullySkipped ? source.last_success_at : completedAt,
        last_error_at: isFullySkipped ? completedAt : null,
        last_error: isFullySkipped
          ? `All fetched jobs were skipped (fetched=${fetchedCount}, skipped=${skippedCount})`
          : null
      })
      .eq("id", source.id);

    if (sourceUpdateError) {
      throw new Error(
        `Failed to update job source ${source.slug}: ${sourceUpdateError.message}`
      );
    }

    return {
      source: source.slug,
      fetched: fetchedCount,
      inserted: insertedCount,
      updated: updatedCount,
      skipped: skippedCount
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const message = error?.message || "Unknown source sync error";

    const { error: runUpdateError } = await supabase
      .from("job_sync_runs")
      .update({
        completed_at: completedAt,
        status: "failed",
        fetched_count: fetchedCount,
        inserted_count: insertedCount,
        updated_count: updatedCount,
        skipped_count: skippedCount,
        error_message: message
      })
      .eq("id", run.id);

    if (runUpdateError) {
      console.error("Failed to finalize failed job sync run:", {
        run_id: run.id,
        source: source.slug,
        message: runUpdateError.message
      });
    }

    const { error: sourceUpdateError } = await supabase
      .from("job_sources")
      .update({
        last_synced_at: completedAt,
        last_error_at: completedAt,
        last_error: message
      })
      .eq("id", source.id);

    if (sourceUpdateError) {
      console.error("Failed to update failed job source:", {
        source: source.slug,
        message: sourceUpdateError.message
      });
    }

    throw error;
  }
}

export async function runJobsAutomation(env) {
  await expireKnownJobs(env);

  const sources = await loadEnabledJobSources(env);

  if (sources.length === 0) {
    console.log("Jobs automation: no enabled sources");
    return {
      sources: 0,
      results: []
    };
  }

  const results = [];

  for (const source of sources) {
    try {
      results.push(await syncJobSource(env, source));
    } catch (error) {
      console.error("Jobs source sync failed:", {
        source: source.slug,
        message: error?.message || "Unknown error"
      });

      results.push({
        source: source.slug,
        error: error?.message || "Unknown error"
      });
    }
  }

  return {
    sources: sources.length,
    results
  };
}
