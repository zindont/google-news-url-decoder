const { GoogleDecoder } = require('./index.js');
const assert = require('node:assert');
const { describe, it, mock, beforeEach, afterEach } = require('node:test');

// Test HTML response that mimics the Google News article page
const MOCK_HTML = `
<html><body>
<c-wiz><div jscontroller="abc" data-n-a-sg="mock_signature_123" data-n-a-ts="1700000000"></div></c-wiz>
</body></html>
`;

// Test batchexecute response format
const MOCK_BATCH_RESPONSE = `)]}'\n\n[["w779db","[\\"https://example.com/original-article\\"]",null,null,null]]`;

describe('GoogleDecoder', () => {
    let decoder;

    beforeEach(() => {
        decoder = new GoogleDecoder();
    });

    describe('getBase64Str', () => {
        it('should extract base64 string from valid /rss/articles/ URL', () => {
            const url = 'https://news.google.com/rss/articles/CBMiSomeBase64String?oc=5';
            const result = decoder.getBase64Str(url);
            assert.strictEqual(result.status, true);
            assert.strictEqual(result.base64_str, 'CBMiSomeBase64String');
        });

        it('should extract base64 string from valid /read/ URL', () => {
            const url = 'https://news.google.com/read/CBMiAnotherBase64?oc=5';
            const result = decoder.getBase64Str(url);
            assert.strictEqual(result.status, true);
            assert.strictEqual(result.base64_str, 'CBMiAnotherBase64');
        });

        it('should reject non-Google News URLs', () => {
            const url = 'https://example.com/articles/something';
            const result = decoder.getBase64Str(url);
            assert.strictEqual(result.status, false);
            assert.ok(result.message.includes('Invalid'));
        });

        it('should reject Google News URLs without articles/read path', () => {
            const url = 'https://news.google.com/home';
            const result = decoder.getBase64Str(url);
            assert.strictEqual(result.status, false);
        });

        it('should handle malformed URLs gracefully', () => {
            const result = decoder.getBase64Str('not-a-url');
            assert.strictEqual(result.status, false);
            assert.ok(result.message.includes('Error'));
        });

        it('should handle empty string', () => {
            const result = decoder.getBase64Str('');
            assert.strictEqual(result.status, false);
        });
    });

    describe('getDecodingParams', () => {
        let originalFetch;

        beforeEach(() => {
            originalFetch = globalThis.fetch;
        });

        afterEach(() => {
            globalThis.fetch = originalFetch;
        });

        it('should extract signature and timestamp from valid HTML', async () => {
            globalThis.fetch = async () => ({
                ok: true,
                text: async () => MOCK_HTML,
                bodyUsed: false,
                body: { cancel: async () => {} },
            });

            const result = await decoder.getDecodingParams('CBMiTest123');
            assert.strictEqual(result.status, true);
            assert.strictEqual(result.signature, 'mock_signature_123');
            assert.strictEqual(result.timestamp, '1700000000');
            assert.strictEqual(result.base64_str, 'CBMiTest123');
        });

        it('should handle HTTP errors', async () => {
            globalThis.fetch = async () => ({
                ok: false,
                status: 403,
                bodyUsed: false,
                body: { cancel: async () => {} },
            });

            const result = await decoder.getDecodingParams('CBMiTest123');
            assert.strictEqual(result.status, false);
            assert.ok(result.message.includes('403'));
        });

        it('should handle missing data element in HTML', async () => {
            globalThis.fetch = async () => ({
                ok: true,
                text: async () => '<html><body><div>No c-wiz here</div></body></html>',
                bodyUsed: false,
                body: { cancel: async () => {} },
            });

            const result = await decoder.getDecodingParams('CBMiTest123');
            assert.strictEqual(result.status, false);
            assert.ok(result.message.includes('Failed to fetch'));
        });

        it('should handle network errors', async () => {
            globalThis.fetch = async () => { throw new Error('Network error'); };

            const result = await decoder.getDecodingParams('CBMiTest123');
            assert.strictEqual(result.status, false);
            assert.ok(result.message.includes('Network error'));
        });
    });

    describe('decodeUrl', () => {
        let originalFetch;

        beforeEach(() => {
            originalFetch = globalThis.fetch;
        });

        afterEach(() => {
            globalThis.fetch = originalFetch;
        });

        it('should decode URL from valid batchexecute response', async () => {
            const mockResponse = `)]}'\n\n[[null,null,"[\\"garturlres\\",\\"https://example.com/decoded-article\\"]"]]`;

            globalThis.fetch = async () => ({
                ok: true,
                text: async () => mockResponse,
                bodyUsed: false,
                body: { cancel: async () => {} },
            });

            const result = await decoder.decodeUrl('sig123', '170000', 'CBMiTest');
            assert.strictEqual(result.status, true);
            assert.strictEqual(result.decoded_url, 'https://example.com/decoded-article');
        });

        it('should handle HTTP errors', async () => {
            globalThis.fetch = async () => ({
                ok: false,
                status: 500,
                bodyUsed: false,
                body: { cancel: async () => {} },
            });

            const result = await decoder.decodeUrl('sig', 'ts', 'b64');
            assert.strictEqual(result.status, false);
            assert.ok(result.message.includes('500'));
        });

        it('should handle unexpected response format', async () => {
            globalThis.fetch = async () => ({
                ok: true,
                text: async () => 'unexpected response with no double newline',
                bodyUsed: false,
                body: { cancel: async () => {} },
            });

            const result = await decoder.decodeUrl('sig', 'ts', 'b64');
            assert.strictEqual(result.status, false);
        });
    });

    describe('decodeBatch', () => {
        let originalFetch;

        beforeEach(() => {
            originalFetch = globalThis.fetch;
        });

        afterEach(() => {
            globalThis.fetch = originalFetch;
        });

        it('should decode multiple URLs using the current format (wrb.fr)', async () => {
            const urls = [
                'https://news.google.com/rss/articles/CBMi1?oc=5',
                'https://news.google.com/rss/articles/CBMi2?oc=5'
            ];

            let callCount = 0;
            globalThis.fetch = async (url, options) => {
                callCount++;
                if (options?.method === 'POST') {
                    const body = decodeURIComponent(options.body);
                    const decodedUrl = body.includes('CBMi1')
                        ? 'https://example.com/res1'
                        : 'https://example.com/res2';
                    const mockBatch = `)]}'\n\n[[ "wrb.fr", "Fbv4je", "[\\\"garturlres\\\",\\\"${decodedUrl}\\\"]" ]]`;
                    return { ok: true, text: async () => mockBatch };
                } else {
                    // getDecodingParams response
                    return {
                        ok: true,
                        text: async () => MOCK_HTML,
                        bodyUsed: false,
                        body: { cancel: async () => {} },
                    };
                }
            };

            const results = await decoder.decodeBatch(urls);
            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0].source_url, urls[0]);
            assert.strictEqual(results[0].decoded_url, 'https://example.com/res1');
            assert.strictEqual(results[1].source_url, urls[1]);
            assert.strictEqual(results[1].decoded_url, 'https://example.com/res2');
            assert.strictEqual(callCount, 4);
        });

        it('should still support the legacy format (w779db)', async () => {
            const urls = ['https://news.google.com/rss/articles/CBMiLegacy?oc=5'];

            globalThis.fetch = async (url, options) => {
                if (options?.method === 'POST') {
                    const mockBatch = `)]}'\n\n[[ "w779db", "Fbv4je", "[\\\"garturlres\\\",\\\"https://example.com/legacy\\\"]" ]]`;
                    return { ok: true, text: async () => mockBatch };
                }
                return { ok: true, text: async () => MOCK_HTML, bodyUsed: false, body: { cancel: async () => {} } };
            };

            const results = await decoder.decodeBatch(urls);
            assert.strictEqual(results[0].status, true);
            assert.strictEqual(results[0].decoded_url, 'https://example.com/legacy');
        });
    });

    describe('decode (integration with mocks)', () => {

        let originalFetch;

        beforeEach(() => {
            originalFetch = globalThis.fetch;
        });

        afterEach(() => {
            globalThis.fetch = originalFetch;
        });

        it('should return error for invalid URL', async () => {
            const result = await decoder.decode('https://example.com/not-google');
            assert.strictEqual(result.status, false);
        });

        it('should decode full pipeline with mocked fetch', async () => {
            let callCount = 0;
            globalThis.fetch = async (url) => {
                callCount++;
                if (callCount === 1) {
                    // getDecodingParams call
                    return {
                        ok: true,
                        text: async () => MOCK_HTML,
                        bodyUsed: false,
                        body: { cancel: async () => {} },
                    };
                } else {
                    // decodeUrl call
                    const mockBatch = `)]}'\n\n[[null,null,"[\\"garturlres\\",\\"https://example.com/final-url\\"]"]]`;
                    return {
                        ok: true,
                        text: async () => mockBatch,
                        bodyUsed: false,
                        body: { cancel: async () => {} },
                    };
                }
            };

            const result = await decoder.decode('https://news.google.com/rss/articles/CBMiTestFull?oc=5');
            assert.strictEqual(result.status, true);
            assert.strictEqual(result.decoded_url, 'https://example.com/final-url');
        });
    });
});
