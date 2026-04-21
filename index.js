const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');

const app = express();


// ================== ✅ 1. 限流 ==================
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 50, // 每个IP最多50次
  message: {
    error: 'Too many requests, please try again later.'
  }
});

app.use(limiter);


// ================== ✅ 2. 缓存 ==================
const cache = new NodeCache({
  stdTTL: 86400, // 默认缓存24小时
  checkperiod: 120
});

// ================== ✅ 3. 认证 ==================
function auth(req, res, next) {
  // x-rapidapi-request-id
  console.log(new Date(), req.url, req.params, req.body, req.ip, req.headers['x-real-ip'], req.headers['x-rapidapi-user']);

  if (req.headers['host'] == 'localhost:3000') {
    next();
    return;
  }

  if (!req.headers['x-rapidapi-user']) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.headers['x-rapidapi-proxy-secret'] !== '8e7848b0-3c94-11f1-a0c1-07ac1be07b54') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  next();
}


// ================== ✅ 4. API ==================
app.get('/search', auth, async (req, res) => {
  try {
    const query = req.query.query || 'Titanic';

    const cacheKey = `search_${query}`;

    // 👉 先查缓存
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({
        source: 'cache',
        ...cached
      });
    }

    // const url = `https://www.themoviedb.org/search/movie?query=${encodeURIComponent(query)}`;
    const url = `https://www.themoviedb.org/search?query=${encodeURIComponent(query)}`;

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9'
      }
    });

    const $ = cheerio.load(response.data);

    const results = [];

    $('.media-card-list .tight').each((i, el) => {
      const linkEle = $(el).find('.content-center a');
      const urlSplit = linkEle.attr('href')?.split('/');
      const id = urlSplit?.pop();
      const type = urlSplit?.pop();
      const title = linkEle.text().trim();
      const date = $(el).find('.content-center .release_date').text().trim();
      const description = $(el).find('.content-center .mt-4').text().trim();
      const image = $(el).find('img').attr('src');
      if (title) {
        results.push({ id, type, title, date, description, image });
      }
    });

    const data = {
      query,
      count: results.length,
      results
    };

    // 👉 写入缓存
    cache.set(cacheKey, data);

    res.json({
      source: 'live',
      ...data
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});


// ================== 启动 ==================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});