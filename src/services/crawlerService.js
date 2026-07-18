import dns from 'dns/promises';

const PRIVATE_IPV4_REGEXP = /^(127\.|10\.|192\.168\.|169\.254\.|0\.)|^(172\.(1[6-9]|2[0-9]|3[0-1])\.)/;
const PRIVATE_IPV6_REGEXP = /^(::1$|fc00::|fe80::)/i;

/**
 * Checks if an IP address belongs to private/internal subnet ranges.
 * @param {string} ip
 * @returns {boolean} True if it is a private IP
 */
export function isPrivateIp(ip) {
  let cleanIp = ip;
  if (ip.startsWith('::ffff:')) {
    cleanIp = ip.substring(7);
  }
  
  if (cleanIp.includes('.')) {
    return PRIVATE_IPV4_REGEXP.test(cleanIp);
  } else {
    return PRIVATE_IPV6_REGEXP.test(cleanIp);
  }
}

/**
 * Resolves a hostname and checks if any of its IPs are private/local.
 * @param {string} hostname
 * @returns {Promise<boolean>} True if the hostname is public and safe to request
 */
export async function resolveAndCheckHostname(hostname) {
  const lower = hostname.toLowerCase().trim();
  if (lower === 'localhost' || lower === 'metadata' || lower === 'metadata.google.internal') {
    return false;
  }
  if (lower.endsWith('.local') || lower.endsWith('.localhost') || lower.endsWith('.internal') || lower.endsWith('.lan') || lower.endsWith('.intranet')) {
    return false;
  }
  
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      return false;
    }
    for (const addr of addresses) {
      if (isPrivateIp(addr.address)) {
        return false;
      }
    }
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Clean HTML markup, stripping scripts, styles, and extracting structured layout items.
 * @param {string} html
 * @returns {Object} Cleaned content, lists, and tables
 */
export function cleanHtml(html) {
  if (!html) return { content: '', lists: [], tables: [] };

  // Strip head, script, style tags and their contents
  let clean = html.replace(/<(script|style|noscript|iframe|head|header|footer|nav|aside)[^>]*>([\s\S]*?)<\/\1>/gi, '');
  
  // Extract list items
  const lists = [];
  const listMatches = clean.match(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi) || [];
  for (const listHtml of listMatches) {
    const items = (listHtml.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || [])
      .map(li => li.replace(/<[^>]+>/g, '').trim())
      .filter(item => item.length > 0);
    if (items.length > 0) lists.push(items);
  }
  
  // Extract tables
  const tables = [];
  const tableMatches = clean.match(/<table[^>]*>([\s\S]*?)<\/table>/gi) || [];
  for (const tableHtml of tableMatches) {
    const rows = [];
    const trMatches = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    for (const trHtml of trMatches) {
      const cells = (trHtml.match(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi) || [])
        .map(cell => cell.replace(/<[^>]+>/g, '').trim());
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length > 0) tables.push(rows);
  }
  
  // Strip all remaining HTML tags
  clean = clean.replace(/<[^>]+>/g, ' ');
  
  // Condense spaces
  clean = clean.replace(/\s+/g, ' ').trim();
  
  return {
    content: clean,
    lists,
    tables
  };
}

/**
 * Fetches webpage content securely with SSRF checks, redirect limits, and size caps.
 * @param {string} url
 * @param {number} maxRedirects
 * @param {number} maxBytes
 * @returns {Promise<Object>} Formatted response data
 */
export async function fetchWebpageContentSafe(url, maxRedirects = 5, maxBytes = 1024 * 1024) {
  let currentUrl = url;
  
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const parsed = new URL(currentUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Invalid protocol: ${parsed.protocol}`);
    }
    
    const isSafe = await resolveAndCheckHostname(parsed.hostname);
    if (!isSafe) {
      throw new Error(`SSRF Prevention: Blocked connection to private/internal host ${parsed.hostname}`);
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    const response = await fetch(currentUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'FLOW-OS-SafeCrawler/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'identity',
        'Connection': 'close'
      },
      redirect: 'manual',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    // Handle manual redirects to check target URL safety
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`Redirect status ${response.status} without location header`);
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    
    if (response.status >= 400) {
      throw new Error(`HTTP Error ${response.status} for URL ${currentUrl}`);
    }
    
    const contentEncoding = response.headers.get('content-encoding');
    if (contentEncoding && contentEncoding !== 'identity') {
      throw new Error(`SSRF Prevention: Refusing compressed response (Content-Encoding: ${contentEncoding})`);
    }
    
    const contentLengthStr = response.headers.get('content-length');
    if (contentLengthStr) {
      const contentLength = parseInt(contentLengthStr, 10);
      if (!isNaN(contentLength) && contentLength > maxBytes) {
        throw new Error(`Content length ${contentLength} exceeds maximum size limit of ${maxBytes} bytes`);
      }
    }
    
    // Stream response body and count bytes to enforce cap
    const reader = response.body.getReader();
    const chunks = [];
    let receivedLength = 0;
    
    while(true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      chunks.push(value);
      receivedLength += value.length;
      
      if (receivedLength > maxBytes) {
        controller.abort();
        throw new Error(`Response body size exceeded maximum limit of ${maxBytes} bytes`);
      }
    }
    
    const mergedBuffer = new Uint8Array(receivedLength);
    let offset = 0;
    for (const chunk of chunks) {
      mergedBuffer.set(chunk, offset);
      offset += chunk.length;
    }
    
    const textDecoder = new TextDecoder('utf-8');
    const rawText = textDecoder.decode(mergedBuffer);
    
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('html')) {
      const cleaned = cleanHtml(rawText);
      return {
        url: currentUrl,
        success: true,
        isHtml: true,
        ...cleaned
      };
    } else {
      return {
        url: currentUrl,
        success: true,
        isHtml: false,
        content: rawText,
        lists: [],
        tables: []
      };
    }
  }
  
  throw new Error(`SSRF Prevention: Too many redirects (${maxRedirects})`);
}
