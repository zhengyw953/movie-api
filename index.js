const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();

app.get('/search', async (req, res) => {
  try {
    const query = req.query.query || 'Titanic';

    const url = `https://www.themoviedb.org/search/movie?query=${encodeURIComponent(query)}`;

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const $ = cheerio.load(response.data);

    const results = [];

    $('.media-card-list .tight').each((i, el) => {
      const title = $(el).find('.content-center a').text().trim();
      const date = $(el).find('.content-center .release_date').text().trim();
      const description = $(el).find('.content-center .mt-4').text().trim();
      const image = $(el).find('img').attr('srcset');
      if (title) {
        results.push({ title, date, description, image });
      }
    });

    res.json({
      query,
      count: results.length,
      results
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});