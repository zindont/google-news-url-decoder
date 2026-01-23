const { parse } = require('node-html-parser');

class GoogleDecoder {
    constructor(proxy = null) {
        this.proxy = proxy;
    }

    /**
     * Extracts the base64 string from a Google News URL.
     * @param {string} sourceUrl 
     * @returns {object}
     */
    getBase64Str(sourceUrl) {
        try {
            const url = new URL(sourceUrl);
            const pathParts = url.pathname.split('/').filter(part => part.length > 0);

            if (
                url.hostname === "news.google.com" &&
                pathParts.length >= 2 &&
                ["articles", "read"].includes(pathParts[pathParts.length - 2])
            ) {
                return { status: true, base64_str: pathParts[pathParts.length - 1] };
            }
            return { status: false, message: "Invalid Google News URL format." };
        } catch (e) {
            return { status: false, message: `Error in getBase64Str: ${e.message}` };
        }
    }

    /**
     * Fetches signature and timestamp required for decoding from Google News.
     * @param {string} base64Str 
     * @returns {Promise<object>}
     */
    async getDecodingParams(base64Str) {
        let response;
        try {
            // We use the RSS URL format as it's often more reliable for scraping
            const url = `https://news.google.com/rss/articles/${base64Str}`;
            response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cache-Control': 'max-age=0',
                    'Sec-Ch-Ua': '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1'
                }
            });

            if (!response.ok) {
                // Cancel the response body to prevent stalled HTTP warning in Cloudflare Workers
                await response.body?.cancel();
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const html = await response.text();
            const root = parse(html);
            const dataElement = root.querySelector('c-wiz > div[jscontroller]');

            if (!dataElement) {
                return {
                    status: false,
                    message: "Failed to fetch data attributes from Google News.",
                };
            }

            return {
                status: true,
                signature: dataElement.getAttribute('data-n-a-sg'),
                timestamp: dataElement.getAttribute('data-n-a-ts'),
                base64_str: base64Str,
            };
        } catch (e) {
            if (response && !response.bodyUsed) {
                try { await response.body?.cancel(); } catch (err) { }
            }
            return {
                status: false,
                message: `Error in getDecodingParams: ${e.message}`,
            };
        }
    }

    /**
     * Decodes the Google News URL using the signature and timestamp.
     * @param {string} signature 
     * @param {string} timestamp 
     * @param {string} base64Str 
     * @returns {Promise<object>}
     */
    async decodeUrl(signature, timestamp, base64Str) {
        let response;
        try {
            const url = "https://news.google.com/_/DotsSplashUi/data/batchexecute";
            const payload = [
                "Fbv4je",
                `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${base64Str}",${timestamp},"${signature}"]`,
            ];

            const reqData = `f.req=${encodeURIComponent(JSON.stringify([[payload]]))}`;

            response = await fetch(url, {
                method: 'POST',
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
                    "Accept": "*/*",
                    "Origin": "https://news.google.com",
                    "Referer": "https://news.google.com/",
                    "Sec-Ch-Ua": '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
                    "Sec-Ch-Ua-Mobile": "?0",
                    "Sec-Ch-Ua-Platform": '"Windows"',
                    "Sec-Fetch-Dest": "empty",
                    "Sec-Fetch-Mode": "cors",
                    "Sec-Fetch-Site": "same-origin",
                },
                body: reqData
            });

            if (!response.ok) {
                // Cancel the response body to prevent stalled HTTP warning in Cloudflare Workers
                await response.body?.cancel();
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const text = await response.text();

            // The response format is usually a bit messy with \n\n and some numbers
            const splitParts = text.split("\n\n");
            if (splitParts.length < 2) {
                throw new Error("Unexpected response format from batchexecute");
            }

            const jsonStr = splitParts[1];
            const parsedData = JSON.parse(jsonStr);

            // We need to extract the second element of the inner JSON string
            // Data structure: [ [ ["w779db", "[...]", null, null, null] ], ... ]
            // The Python code does: json.loads(parsed_data[0][2])[1]

            const innerDataStr = parsedData[0][2];
            const innerData = JSON.parse(innerDataStr);
            const decodedUrl = innerData[1];

            return { status: true, decoded_url: decodedUrl };
        } catch (e) {
            if (response && !response.bodyUsed) {
                try { await response.body?.cancel(); } catch (err) { }
            }
            return {
                status: false,
                message: `Error in decodeUrl: ${e.message}`,
            };
        }
    }

    /**
     * Decodes multiple Google News article URLs in a single batched request.
     * @param {string[]} sourceUrls 
     * @returns {Promise<object[]>}
     */
    async decodeBatch(sourceUrls) {
        let response;
        try {
            const results = [];
            for (const sourceUrl of sourceUrls) {
                const base64Response = this.getBase64Str(sourceUrl);
                if (!base64Response.status) {
                    results.push({ status: false, source_url: sourceUrl, message: base64Response.message });
                    continue;
                }

                // Add a small random delay between parameter fetches to look more human
                await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 500) + 200));

                const paramsResponse = await this.getDecodingParams(base64Response.base64_str);
                if (!paramsResponse.status) {
                    results.push({ status: false, source_url: sourceUrl, message: paramsResponse.message });
                    continue;
                }
                results.push({
                    status: true,
                    source_url: sourceUrl,
                    signature: paramsResponse.signature,
                    timestamp: paramsResponse.timestamp,
                    base64_str: paramsResponse.base64_str
                });
            }

            const successfulRequests = results.filter(r => r.status);
            if (successfulRequests.length === 0) {
                return results;
            }

            const url = "https://news.google.com/_/DotsSplashUi/data/batchexecute";
            const payloads = successfulRequests.map(req => ([
                "Fbv4je",
                `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${req.base64_str}",${req.timestamp},"${req.signature}"]`,
            ]));

            const reqData = `f.req=${encodeURIComponent(JSON.stringify([payloads]))}`;

            response = await fetch(url, {
                method: 'POST',
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
                    "Accept": "*/*",
                    "Origin": "https://news.google.com",
                    "Referer": "https://news.google.com/",
                    "Sec-Ch-Ua": '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
                    "Sec-Ch-Ua-Mobile": "?0",
                    "Sec-Ch-Ua-Platform": '"Windows"',
                    "Sec-Fetch-Dest": "empty",
                    "Sec-Fetch-Mode": "cors",
                    "Sec-Fetch-Site": "same-origin",
                },
                body: reqData
            });

            if (!response.ok) {
                // Cancel the response body to prevent stalled HTTP warning in Cloudflare Workers
                await response.body?.cancel();
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const text = await response.text();
            const splitParts = text.split("\n\n");
            if (splitParts.length < 2) {
                throw new Error("Unexpected response format from batchexecute");
            }

            const jsonStr = splitParts[1];
            const parsedData = JSON.parse(jsonStr);

            const batchResponses = parsedData.filter(d => d[0] === "w779db");

            let successIdx = 0;
            return results.map(res => {
                if (!res.status) return res;

                try {
                    const row = batchResponses[successIdx++];
                    const innerDataStr = row[2];
                    const innerData = JSON.parse(innerDataStr);
                    const decodedUrl = innerData[1];
                    return { status: true, source_url: res.source_url, decoded_url: decodedUrl };
                } catch (e) {
                    return { status: false, source_url: res.source_url, message: `Parsing error: ${e.message}` };
                }
            });

        } catch (e) {
            if (response && !response.bodyUsed) {
                try { await response.body?.cancel(); } catch (err) { }
            }
            return [{
                status: false,
                message: `Error in decodeBatch: ${e.message}`,
            }];
        }
    }

    /**
     * Main method to decode a Google News article URL.
     * @param {string} sourceUrl 
     * @returns {Promise<object>}
     */
    async decode(sourceUrl) {
        try {
            const base64Response = this.getBase64Str(sourceUrl);
            if (!base64Response.status) return base64Response;

            const paramsResponse = await this.getDecodingParams(base64Response.base64_str);
            if (!paramsResponse.status) return paramsResponse;

            const decodedResponse = await this.decodeUrl(
                paramsResponse.signature,
                paramsResponse.timestamp,
                paramsResponse.base64_str
            );

            return decodedResponse;
        } catch (e) {
            return {
                status: false,
                message: `Error in decode: ${e.message}`,
            };
        }
    }
}

// Example usage
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log("Usage: node index.js <google-news-url1> [google-news-url2] ...");
        process.exit(1);
    }

    const decoder = new GoogleDecoder();
    if (args.length === 1) {
        decoder.decode(args[0]).then(result => {
            if (result.status) {
                console.log(result.decoded_url);
            } else {
                console.error("Error:", result.message);
                process.exit(1);
            }
        }).catch(err => {
            console.error("Fatal Error:", err);
            process.exit(1);
        });
    } else {
        decoder.decodeBatch(args).then(results => {
            results.forEach((result, i) => {
                if (result.status) {
                    console.log(`[${i}] ${result.decoded_url}`);
                } else {
                    console.error(`[${i}] Error: ${result.message} (${result.source_url})`);
                }
            });
        }).catch(err => {
            console.error("Fatal Error:", err);
            process.exit(1);
        });
    }
}

module.exports = { GoogleDecoder };
