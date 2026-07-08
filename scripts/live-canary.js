#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const { GoogleDecoder } = require('../index.js');

const DEFAULT_FEED_URL = 'https://news.google.com/rss/search?q=technology&hl=en-US&gl=US&ceid=US:en';
const FEED_URL = process.env.GOOGLE_NEWS_CANARY_FEED_URL || DEFAULT_FEED_URL;
const SAMPLE_SIZE = parsePositiveInt(process.env.GOOGLE_NEWS_CANARY_SAMPLE_SIZE, 3);
const MIN_SUCCESS = parsePositiveInt(process.env.GOOGLE_NEWS_CANARY_MIN_SUCCESS, Math.min(2, SAMPLE_SIZE));
const REQUEST_TIMEOUT_MS = parsePositiveInt(process.env.GOOGLE_NEWS_CANARY_TIMEOUT_MS, 15000);

const batchSnapshots = [];
const canaryState = {
    urls: [],
    results: [],
    successCount: 0,
    candidateCount: 0,
    summaryWritten: false,
};

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function decodeXmlEntities(value) {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function stripCdata(value) {
    return value.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
}

function isGoogleNewsArticleUrl(value) {
    try {
        const url = new URL(value);
        return url.hostname === 'news.google.com' &&
            (url.pathname.includes('/rss/articles/') || url.pathname.includes('/read/'));
    } catch (e) {
        return false;
    }
}

function extractArticleUrls(feedText) {
    const urls = [];
    const seen = new Set();
    const linkPattern = /<link>([\s\S]*?)<\/link>/g;
    let match;

    while ((match = linkPattern.exec(feedText)) !== null) {
        const url = decodeXmlEntities(stripCdata(match[1].trim()));
        if (!isGoogleNewsArticleUrl(url) || seen.has(url)) continue;

        seen.add(url);
        urls.push(url);
    }

    return urls;
}

function selectRandomUrls(urls, sampleSize) {
    const shuffled = [...urls];

    for (let index = shuffled.length - 1; index > 0; index--) {
        const swapIndex = crypto.randomInt(index + 1);
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }

    return shuffled.slice(0, sampleSize);
}

async function fetchWithTimeout(fetchImpl, url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        return await fetchImpl(url, {
            ...options,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }
}

function isBatchExecuteRequest(url, options = {}) {
    const method = options.method || 'GET';
    return method.toUpperCase() === 'POST' && String(url).includes('/batchexecute');
}

function tryParseJson(value) {
    if (typeof value !== 'string') return null;

    try {
        return JSON.parse(value);
    } catch (e) {
        return null;
    }
}

function summarizeRow(row) {
    if (!Array.isArray(row)) {
        return { row_type: typeof row };
    }

    const innerData = tryParseJson(row[2]);
    return {
        id: row[0] ?? null,
        action: row[1] ?? null,
        has_payload: typeof row[2] === 'string',
        inner_type: Array.isArray(innerData) ? innerData[0] : null,
    };
}

function summarizeBatchexecuteText(text) {
    const jsonCandidates = text
        .split('\n\n')
        .map(part => part.trim())
        .filter(part => part.startsWith('['));

    for (const candidate of jsonCandidates) {
        const parsedData = tryParseJson(candidate);
        if (!Array.isArray(parsedData)) continue;

        const rowShapes = {};
        for (const row of parsedData) {
            const key = Array.isArray(row)
                ? `${String(row[0])}:${String(row[1])}`
                : typeof row;
            rowShapes[key] = (rowShapes[key] || 0) + 1;
        }

        return {
            parse_status: 'ok',
            row_count: parsedData.length,
            row_shapes: rowShapes,
            sample_rows: parsedData.slice(0, 8).map(summarizeRow),
        };
    }

    return {
        parse_status: 'failed',
        response_prefix: text.slice(0, 120).replace(/\s+/g, ' '),
    };
}

function installFetchInstrumentation() {
    const nativeFetch = globalThis.fetch.bind(globalThis);

    globalThis.fetch = async (url, options = {}) => {
        const response = await fetchWithTimeout(nativeFetch, url, options);

        if (isBatchExecuteRequest(url, options)) {
            try {
                const text = await response.clone().text();
                batchSnapshots.push(summarizeBatchexecuteText(text));
            } catch (e) {
                batchSnapshots.push({
                    parse_status: 'failed',
                    error: e.message,
                });
            }
        }

        return response;
    };
}

function hostOf(value) {
    try {
        return new URL(value).hostname;
    } catch (e) {
        return 'unknown-host';
    }
}

function compactUrl(value) {
    try {
        const url = new URL(value);
        const path = url.pathname.length > 42
            ? `${url.pathname.slice(0, 39)}...`
            : url.pathname;
        return `${url.hostname}${path}`;
    } catch (e) {
        return String(value);
    }
}

function escapeMarkdownTableCell(value) {
    return String(value)
        .replace(/\r?\n/g, ' ')
        .replace(/\|/g, '\\|');
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function summaryLink(label, url) {
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function buildStepSummary({ urls, results, successCount, failure = null }) {
    const passed = !failure && successCount >= MIN_SUCCESS;
    const lines = [
        '## Google News Decode Canary',
        '',
        `Canary status: **${passed ? 'Passed' : 'Failed'}**`,
        `Result: **${successCount}/${urls.length} decoded**`,
        `Minimum required: **${MIN_SUCCESS}/${SAMPLE_SIZE} decoded**`,
        `Candidate pool: **${canaryState.candidateCount} Google News URLs**`,
        `Feed: ${summaryLink(compactUrl(FEED_URL), FEED_URL)}`,
        '',
    ];

    if (failure) {
        lines.push(`Failure: **${escapeMarkdownTableCell(failure.message)}**`, '');
    }

    if (urls.length > 0) {
        lines.push('| # | Status | Google News URL | Original URL / Error |');
        lines.push('|---:|---|---|---|');

        urls.forEach((sourceUrl, index) => {
            const result = results[index];
            const status = result?.status && result.decoded_url ? 'Success' : 'Failed';
            const sourceLink = summaryLink(compactUrl(sourceUrl), sourceUrl);
            const output = result?.status && result.decoded_url
                ? summaryLink(compactUrl(result.decoded_url), result.decoded_url)
                : escapeMarkdownTableCell(result?.message || 'No result returned');

            lines.push(`| ${index + 1} | ${status} | ${sourceLink} | ${output} |`);
        });

        lines.push('');
    }

    if (batchSnapshots.length > 0) {
        lines.push('<details>');
        lines.push('<summary>batchexecute response summary</summary>');
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(batchSnapshots, null, 2));
        lines.push('```');
        lines.push('</details>');
        lines.push('');
    }

    return `${lines.join('\n')}\n`;
}

function writeStepSummary(summary) {
    if (!process.env.GITHUB_STEP_SUMMARY) return;

    try {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    } catch (e) {
        console.warn(`Could not write GitHub step summary: ${e.message}`);
    }
}

function writeCanarySummary(failure = null) {
    if (canaryState.summaryWritten) return;

    writeStepSummary(buildStepSummary({
        urls: canaryState.urls,
        results: canaryState.results,
        successCount: canaryState.successCount,
        failure,
    }));
    canaryState.summaryWritten = true;
}

async function main() {
    installFetchInstrumentation();

    console.log(`Canary feed: ${FEED_URL}`);
    console.log(`Sample size: ${SAMPLE_SIZE}; minimum success: ${MIN_SUCCESS}`);

    const feedResponse = await fetch(FEED_URL, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; google-news-url-decoder-canary/1.0)',
            'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
        },
    });

    if (!feedResponse.ok) {
        throw new Error(`Failed to fetch Google News RSS feed: HTTP ${feedResponse.status}`);
    }

    const feedText = await feedResponse.text();
    const candidateUrls = extractArticleUrls(feedText);
    canaryState.candidateCount = candidateUrls.length;

    if (candidateUrls.length < SAMPLE_SIZE) {
        throw new Error(`Expected ${SAMPLE_SIZE} Google News article URLs, found ${candidateUrls.length}`);
    }

    const urls = selectRandomUrls(candidateUrls, SAMPLE_SIZE);
    console.log(`Candidate URL pool: ${candidateUrls.length}; selected ${urls.length} random URLs`);

    urls.forEach((url, index) => {
        console.log(`[source ${index}] ${url}`);
    });
    canaryState.urls = urls;

    const decoder = new GoogleDecoder();
    const results = await decoder.decodeBatch(urls);
    const successCount = results.filter(result => result.status && result.decoded_url).length;
    canaryState.results = results;
    canaryState.successCount = successCount;

    results.forEach((result, index) => {
        if (result.status) {
            console.log(`[result ${index}] ok -> ${hostOf(result.decoded_url)}`);
            return;
        }

        console.error(`[result ${index}] failed -> ${result.message}`);
    });

    if (batchSnapshots.length > 0) {
        console.log('batchexecute response summary:');
        console.log(JSON.stringify(batchSnapshots, null, 2));
    }

    writeCanarySummary();

    if (successCount < MIN_SUCCESS) {
        throw new Error(`Live canary decoded ${successCount}/${urls.length}; expected at least ${MIN_SUCCESS}`);
    }

    console.log(`Live canary passed: decoded ${successCount}/${urls.length}`);
}

main().catch(error => {
    if (batchSnapshots.length > 0) {
        console.error('batchexecute response summary at failure:');
        console.error(JSON.stringify(batchSnapshots, null, 2));
    }

    writeCanarySummary(error);

    console.error(`Live canary failed: ${error.message}`);
    process.exitCode = 1;
});
