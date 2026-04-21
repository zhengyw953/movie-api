const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');

const app = express();

// ================== ✅ 限流 ==================
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  message: { error: 'Too many requests' }
});
app.use(limiter);

// ================== ✅ 缓存 ==================
const cache = new NodeCache({
  stdTTL: 86400,
  checkperiod: 120
});

// ================== ✅ 认证 ==================
function auth(req, res, next) {
  if (req.headers['host'] === 'localhost:3000') return next();

  if (!req.headers['x-rapidapi-user']) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.headers['x-rapidapi-proxy-secret'] !== '8e7848b0-3c94-11f1-a0c1-07ac1be07b54') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  next();
}

// ================== 工具函数 ==================
async function fetchPage(url, lang) {
  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept-Language': lang || 'en-US,en;q=0.9'
    }
  });
  return cheerio.load(res.data);
}

function getCast($) {
  const cast = [];
  $('.card.character').each((i, el) => {
    const name = $(el).find('.name a').text().trim();
    const character = $(el).find('.character').text().trim();
    const image = $(el).find('img').attr('src');
    if (name) cast.push({ name, character, image });
  });
  return cast;
}

// ================== ✅ 1. SEARCH ==================
app.get('/search', auth, async (req, res) => {
  try {
    const query = req.query.query || 'Titanic';
    const key = `search_${query}`;

    const cached = cache.get(key);
    if (cached) return res.json({ source: 'cache', data: cached });

    const url = `https://www.themoviedb.org/search?query=${encodeURIComponent(query)}`;
    const $ = await fetchPage(url, req.headers['accept-language']);

    const results = [];

    $('.media-card-list .tight').each((i, el) => {
      const linkEle = $(el).find('.content-center a');
      const urlSplit = linkEle.attr('href')?.split('/');
      const id = urlSplit?.pop();
      const type = urlSplit?.pop();

      const title = linkEle.text().trim();
      const date = $(el).find('.release_date').text().trim();
      const description = $(el).find('.mt-4').text().trim();
      const image = $(el).find('img').attr('src');

      if (title) {
        results.push({ id, type, title, date, description, image });
      }
    });

    const data = { query, count: results.length, results };

    cache.set(key, data);
    res.json({ source: 'live', data });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================== ✅ 2. MOVIE DETAIL ==================
app.get('/movie/detail', auth, async (req, res) => {
  try {
    const { id } = req.query;
    const key = `movie_${id}`;

    const cached = cache.get(key);
    if (cached) return res.json({ source: 'cache', data: cached });

    const url = `https://www.themoviedb.org/movie/${id}`;
    const $ = await fetchPage(url, req.headers['accept-language']);

    const title = $('h2 a').first().text().trim();
    const overview = $('.overview p').text().trim();
    const rating = $('.user_score_chart').attr('data-percent');
    const genres = [];
    $('.genres a').each((i, el) => genres.push($(el).text().trim()));

    const poster = $('.poster img').attr('src');
    const backdrop = $('.backdrop img').attr('src');
    const runtime = $('span.runtime').text().trim();
    const release_date = $('.release').text().trim();

    const cast = getCast($);

    const data = {
      id,
      type: 'movie',
      title,
      overview,
      rating,
      genres,
      poster,
      backdrop,
      runtime,
      release_date,
      cast
    };

    cache.set(key, data);
    res.json({ source: 'live', data });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================== ✅ 3. TV DETAIL ==================
app.get('/tv/detail', auth, async (req, res) => {
  try {
    const { id } = req.query;
    const key = `tv_${id}`;

    const cached = cache.get(key);
    if (cached) return res.json({ source: 'cache', data: cached });

    const url = `https://www.themoviedb.org/tv/${id}`;
    const $ = await fetchPage(url, req.headers['accept-language']);

    const title = $('h2 a').first().text().trim();
    const overview = $('.overview p').text().trim();
    const rating = $('.user_score_chart').attr('data-percent');

    const genres = [];
    $('.genres a').each((i, el) => genres.push($(el).text().trim()));

    const poster = $('.poster img').attr('src');
    const backdrop = $('.backdrop img').attr('src');
    const release_date = $('.release').text().trim();

    const seasons = [];
    $('.season').each((i, el) => {
      const season_number = $(el).find('h2 a').text().match(/\d+/)?.[0];
      if (season_number) seasons.push({ season_number });
    });

    const cast = getCast($);

    const data = {
      id,
      type: 'tv',
      title,
      overview,
      rating,
      genres,
      poster,
      backdrop,
      release_date,
      seasons,
      cast
    };

    cache.set(key, data);
    res.json({ source: 'live', data });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================== ✅ 4. TV SEASON ==================
app.get('/tv/season', auth, async (req, res) => {
  try {
    const { id, season } = req.query;
    const key = `tv_${id}_season_${season}`;

    const cached = cache.get(key);
    if (cached) return res.json({ source: 'cache', data: cached });

    const url = `https://www.themoviedb.org/tv/${id}/season/${season}`;
    const $ = await fetchPage(url, req.headers['accept-language']);

    const episodes = [];

    $('.episode').each((i, el) => {
      const title = $(el).find('h3 a').text().trim();
      const episode_number = i + 1;
      const air_date = $(el).find('.air_date').text().trim();
      const overview = $(el).find('.overview').text().trim();
      const still = $(el).find('img').attr('src');

      if (title) {
        episodes.push({
          episode_number,
          title,
          air_date,
          overview,
          still
        });
      }
    });

    const data = {
      id,
      season,
      episodes
    };

    cache.set(key, data);
    res.json({ source: 'live', data });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================== ✅ 5. TRENDING ==================
app.get('/trending', auth, async (req, res) => {
  try {
    const key = `trending`;

    const cached = cache.get(key);
    if (cached) return res.json({ source: 'cache', data: cached });

    const url = `https://www.themoviedb.org/trending`;
    const $ = await fetchPage(url, req.headers['accept-language']);

    const results = [];

    $('.card').each((i, el) => {
      const linkEle = $(el).find('a.image');
      const href = linkEle.attr('href') || '';
      const parts = href.split('/');

      const id = parts.pop();
      const type = parts.pop();

      const title = $(el).find('.title').text().trim();
      const image = $(el).find('img').attr('src');
      const rating = $(el).find('.user_score_chart').attr('data-percent');

      if (title) {
        results.push({
          id,
          type,
          title,
          rating,
          image
        });
      }
    });

    const data = {
      count: results.length,
      results
    };

    cache.set(key, data);
    res.json({ source: 'live', data });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================== ✅ 6. RECOMMEND ==================
app.get('/recommend', auth, async (req, res) => {
  try {
    const { id, type } = req.query;

    if (!id || !type) {
      return res.status(400).json({ error: 'id and type required' });
    }

    const key = `recommend_${type}_${id}`;

    const cached = cache.get(key);
    if (cached) return res.json({ source: 'cache', data: cached });

    const url = `https://www.themoviedb.org/${type}/${id}/recommendations`;
    const $ = await fetchPage(url, req.headers['accept-language']);

    const results = [];

    $('.card').each((i, el) => {
      const linkEle = $(el).find('a.image');
      const href = linkEle.attr('href') || '';
      const parts = href.split('/');

      const rid = parts.pop();
      const rtype = parts.pop();

      const title = $(el).find('.title').text().trim();
      const image = $(el).find('img').attr('src');
      const rating = $(el).find('.user_score_chart').attr('data-percent');

      if (title) {
        results.push({
          id: rid,
          type: rtype,
          title,
          rating,
          image
        });
      }
    });

    const data = {
      id,
      type,
      count: results.length,
      results
    };

    cache.set(key, data);
    res.json({ source: 'live', data });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================== 启动 ==================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});