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

decoder.decode(googleNewsUrl)
    .then(result => {
        if (result.status) {
            console.log('Original URL:', result.decoded_url);
        } else {
            console.error('Error:', result.message);
        }
    })
    .catch(err => console.error(err));
```

### Via Command Line

If you have the package installed locally:

```bash
node node_modules/google-news-url-decoder/index.js "YOUR_GOOGLE_NEWS_URL"
```

## How it works

The decoder works by:
1. Extracting the base64 encoded string from the Google News URL path.
2. Fetching the necessary decoding parameters (signature and timestamp) from Google News.
3. Making a request to Google's internal `batchexecute` endpoint to get the final decoded URL.

## Features
- No browser automation required (no Puppeteer/Playwright needed).
- Fast and lightweight.
- Uses built-in `fetch` (requires Node.js 18+).

## License

MIT
