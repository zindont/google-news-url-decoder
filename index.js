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
        try {
            // We use the RSS URL format as it's often more reliable for scraping
            const url = `https://news.google.com/rss/articles/${base64Str}`;
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
                }
            });

            if (!response.ok) {
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
        try {
            const url = "https://news.google.com/_/DotsSplashUi/data/batchexecute";
            const payload = [
                "Fbv4je",
                `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${base64Str}",${timestamp},"${signature}"]`,
            ];

            const reqData = `f.req=${encodeURIComponent(JSON.stringify([[payload]]))}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
                },
                body: reqData
            });

            if (!response.ok) {
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
            return {
                status: false,
                message: `Error in decodeUrl: ${e.message}`,
            };
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
        console.log("Usage: node index.js <google-news-url>");
        process.exit(1);
    }

    const url = args[0];
    const decoder = new GoogleDecoder();
    decoder.decode(url).then(result => {
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
}

module.exports = { GoogleDecoder };
