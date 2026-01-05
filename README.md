# Google News URL Decoder

A lightweight Node.js library to decode Google News URLs into their original source URLs. This is a port of the Python `googlenewsdecoder` library.

## Installation

```bash
npm install google-news-url-decoder
```

## Usage

### As a Library

```javascript
const { GoogleDecoder } = require('google-news-url-decoder');

const decoder = new GoogleDecoder();
const googleNewsUrl = 'https://news.google.com/rss/articles/...';

// Single decode
decoder.decode(googleNewsUrl)
    .then(result => {
        if (result.status) {
            console.log('Original URL:', result.decoded_url);
        } else {
            console.error('Error:', result.message);
        }
    })
    .catch(err => console.error(err));

// Batch decoding (optimizes batchexecute calls)
const urls = [ 'url1', 'url2', '...'];
decoder.decodeBatch(urls)
    .then(results => {
        results.forEach((res, i) => {
            if (res.status) {
                console.log(`[${i}] ${res.decoded_url}`);
            } else {
                console.error(`[${i}] Error: ${res.message}`);
            }
        });
    });
```

### Via Command Line

If you have the package installed locally:

```bash
# Decode single URL
node node_modules/google-news-url-decoder/index.js "YOUR_GOOGLE_NEWS_URL"

# Batch decode multiple URLs
node node_modules/google-news-url-decoder/index.js "URL1" "URL2" "URL3"
```

## How it works

The decoder works by:
1. Extracting the base64 encoded string from the Google News URL path.
2. Fetching the necessary decoding parameters (signature and timestamp) from Google News article pages (serialized with random delays to avoid rate limits).
3. Making a request to Google's internal `batchexecute` endpoint to get the final decoded URL. The batch method sends multiple requests in a single HTTP call to minimize network overhead and rate-limiting risks.

## Features
- No browser automation required (no Puppeteer/Playwright needed).
- Fast and lightweight.
- Supports batch decoding.
- Uses built-in `fetch` (requires Node.js 18+).

## License

MIT
