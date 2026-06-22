export type ExtractedWhatsAppContacts = {
  emails: string[];
  phones: string[];
  phoneRawTexts: string[];
  urls: string[];
  linkedinUrls: string[];
  websiteUrls: string[];
  twitterUrls: string[];
  githubUrls: string[];
  portfolioUrls: string[];
};

const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const validEmailPattern = /^[\w.%+\-]+@[\w.\-]+\.[a-zA-Z]{2,}$/;
const urlPattern = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+|\b(?:linkedin\.com|x\.com|twitter\.com|github\.com)\/[^\s<>"'`]+/gi;
const bareDomainPattern = /\b(?:[a-z0-9-]+\.)+(?:com|in|io|ai|co|org|net|dev|app|tech|xyz|me)(?:\/[^\s<>"'`]*)?/gi;
const phonePattern = /(?:\+?\d[\d\s().-]{7,}\d)/g;

const portfolioHosts = [
  "behance.net",
  "dribbble.com",
  "carbonmade.com",
  "read.cv",
  "linktr.ee",
  "carrd.co",
];

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function trimToken(value: string) {
  return value.trim().replace(/[),.;:!?\]}>'"]+$/g, "").replace(/^[([{<'"]+/g, "");
}

function normalizeObfuscatedEmailText(text: string) {
  return text
    .replace(/\s*(?:\[|\(|\{)?\s*\bat\b\s*(?:\]|\)|\})?\s*/gi, (match) => {
      return /[\[({]|\bat\b/i.test(match) && /\s|[\[({]/.test(match) ? "@" : match;
    })
    .replace(/\s*(?:\[|\(|\{)?\s*\bdot\b\s*(?:\]|\)|\})?\s*/gi, (match) => {
      return /[\[({]|\bdot\b/i.test(match) && /\s|[\[({]/.test(match) ? "." : match;
    });
}

export function normalizeEmail(value: string) {
  const normalized = normalizeObfuscatedEmailText(value).trim().toLowerCase();
  return validEmailPattern.test(normalized) ? normalized : null;
}

function extractEmails(text: string) {
  const normalizedText = normalizeObfuscatedEmailText(text);
  const matches = normalizedText.match(emailPattern) ?? [];
  return unique(matches.map((match) => normalizeEmail(match)).filter((value): value is string => Boolean(value)));
}

function normalizeUrl(value: string) {
  const trimmed = trimToken(value);
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function extractUrls(text: string) {
  const urls = new Set<string>();
  const urlMatches = text.match(urlPattern) ?? [];
  urlMatches.forEach((match) => {
    const normalized = normalizeUrl(match);
    if (normalized) urls.add(normalized);
  });

  let bareMatch: RegExpExecArray | null;
  bareDomainPattern.lastIndex = 0;
  while ((bareMatch = bareDomainPattern.exec(text)) !== null) {
    const previousChar = text[bareMatch.index - 1];
    if (previousChar === "@" || previousChar === "/") continue;

    const normalized = normalizeUrl(bareMatch[0]);
    if (normalized) urls.add(normalized);
  }

  return Array.from(urls);
}

function hostEndsWith(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function classifyUrls(urls: string[]) {
  const linkedinUrls: string[] = [];
  const websiteUrls: string[] = [];
  const twitterUrls: string[] = [];
  const githubUrls: string[] = [];
  const portfolioUrls: string[] = [];

  for (const urlValue of urls) {
    const url = new URL(urlValue);
    const host = url.hostname.replace(/^www\./, "");

    if (hostEndsWith(host, "linkedin.com")) {
      linkedinUrls.push(urlValue);
    } else if (hostEndsWith(host, "x.com") || hostEndsWith(host, "twitter.com")) {
      twitterUrls.push(urlValue);
    } else if (hostEndsWith(host, "github.com")) {
      githubUrls.push(urlValue);
    } else if (portfolioHosts.some((domain) => hostEndsWith(host, domain)) || /portfolio|resume|cv/i.test(url.pathname)) {
      portfolioUrls.push(urlValue);
      websiteUrls.push(urlValue);
    } else {
      websiteUrls.push(urlValue);
    }
  }

  return {
    linkedinUrls: unique(linkedinUrls),
    websiteUrls: unique(websiteUrls),
    twitterUrls: unique(twitterUrls),
    githubUrls: unique(githubUrls),
    portfolioUrls: unique(portfolioUrls),
  };
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;

  if (value.trim().startsWith("+")) return `+${digits}`;
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length >= 11) return `+${digits}`;

  return digits;
}

function extractPhones(text: string, urls: string[]) {
  const scrubbedText = urls.reduce((current, url) => current.replace(url, " "), text);
  const matches = scrubbedText.match(phonePattern) ?? [];
  const phonePairs = matches.map((match) => ({ raw: trimToken(match), normalized: normalizePhone(match) }));

  return {
    phones: unique(phonePairs.map((pair) => pair.normalized).filter((value): value is string => Boolean(value))),
    phoneRawTexts: unique(phonePairs.filter((pair) => pair.normalized).map((pair) => pair.raw)),
  };
}

function extractContextualHandles(text: string) {
  const twitterUrls: string[] = [];
  const githubUrls: string[] = [];
  const twitterHandlePattern = /(?:twitter|x)\s*[:\-]?\s*@([a-zA-Z0-9_]{1,15})\b/gi;
  const githubHandlePattern = /(?:github|git)\s*[:\-]?\s*@?([a-zA-Z0-9-]{1,39})\b/gi;

  let twitterMatch: RegExpExecArray | null;
  while ((twitterMatch = twitterHandlePattern.exec(text)) !== null) {
    twitterUrls.push(`https://x.com/${twitterMatch[1]}`);
  }

  let githubMatch: RegExpExecArray | null;
  while ((githubMatch = githubHandlePattern.exec(text)) !== null) {
    githubUrls.push(`https://github.com/${githubMatch[1]}`);
  }

  return { twitterUrls: unique(twitterUrls), githubUrls: unique(githubUrls) };
}

export function extractWhatsAppContacts(text: string): ExtractedWhatsAppContacts {
  const emails = extractEmails(text);
  const urls = extractUrls(text);
  const classifiedUrls = classifyUrls(urls);
  const phones = extractPhones(text, urls);
  const contextualHandles = extractContextualHandles(text);

  return {
    emails,
    phones: phones.phones,
    phoneRawTexts: phones.phoneRawTexts,
    urls,
    linkedinUrls: classifiedUrls.linkedinUrls,
    websiteUrls: classifiedUrls.websiteUrls,
    twitterUrls: unique([...classifiedUrls.twitterUrls, ...contextualHandles.twitterUrls]),
    githubUrls: unique([...classifiedUrls.githubUrls, ...contextualHandles.githubUrls]),
    portfolioUrls: classifiedUrls.portfolioUrls,
  };
}

export function formatWhatsAppContactHints(contacts: ExtractedWhatsAppContacts) {
  return JSON.stringify({
    emails: contacts.emails,
    phones: contacts.phones,
    phoneRawTexts: contacts.phoneRawTexts,
    linkedinUrls: contacts.linkedinUrls,
    websiteUrls: contacts.websiteUrls,
    twitterUrls: contacts.twitterUrls,
    githubUrls: contacts.githubUrls,
    portfolioUrls: contacts.portfolioUrls,
  }, null, 2);
}