// app.js
const STATE = {
  reviews: [],
  loading: false
};

const EL = {
  status: document.getElementById('status'),
  error: document.getElementById('error'),
  btn: document.getElementById('analyzeBtn'),
  token: document.getElementById('hfToken'),
  reviewText: document.getElementById('reviewText'),
  sentimentIcon: document.getElementById('sentimentIcon'),
  sentimentText: document.getElementById('sentimentText'),
  scoreText: document.getElementById('scoreText')
};

function setStatus(msg) {
  if (!EL.status) return;
  EL.status.style.display = 'flex';
  EL.status.querySelector('span')?.remove();
  const span = document.createElement('span');
  span.textContent = msg;
  EL.status.appendChild(span);
}
function clearStatus() {
  EL.status.style.display = 'none';
}
function showError(msg) {
  EL.error.textContent = msg;
  EL.error.style.display = 'block';
}
function clearError() {
  EL.error.textContent = '';
  EL.error.style.display = 'none';
}

async function loadTSV() {
  try {
    setStatus('Loading reviews…');
    const res = await fetch('reviews_test.tsv', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to fetch reviews_test.tsv (${res.status})`);
    const text = await res.text();

    const parsed = Papa.parse(text, {
      header: true,
      delimiter: '\t',
      skipEmptyLines: true
    });

    if (parsed.errors?.length) {
      console.warn('PapaParse errors:', parsed.errors);
    }

    const rows = Array.isArray(parsed.data) ? parsed.data : [];
    STATE.reviews = rows
      .map(r => (r && typeof r.text === 'string' ? r.text.trim() : ''))
      .filter(Boolean);

    if (STATE.reviews.length === 0) {
      throw new Error('No reviews found. Ensure the TSV has a "text" column.');
    }

    setStatus(`Loaded ${STATE.reviews.length.toLocaleString()} reviews.`);
    EL.btn.disabled = false;
  } catch (err) {
    showError(err.message || String(err));
    setStatus('Unable to load reviews.');
    EL.btn.disabled = true;
  }
}

function pickRandomReview() {
  const arr = STATE.reviews;
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
}

function updateSentimentUI(kind, score) {
  EL.sentimentIcon.className = 'icon';
  EL.scoreText.textContent = '';

  if (kind === 'positive') {
    EL.sentimentIcon.classList.add('pos');
    EL.sentimentIcon.innerHTML = '<i class="fa-solid fa-thumbs-up"></i>';
    EL.sentimentText.textContent = 'Positive';
  } else if (kind === 'negative') {
    EL.sentimentIcon.classList.add('neg');
    EL.sentimentIcon.innerHTML = '<i class="fa-solid fa-thumbs-down"></i>';
    EL.sentimentText.textContent = 'Negative';
  } else {
    EL.sentimentIcon.classList.add('neu');
    EL.sentimentIcon.innerHTML = '<i class="fa-regular fa-circle-question"></i>';
    EL.sentimentText.textContent = 'Neutral / Uncertain';
  }

  if (typeof score === 'number' && !Number.isNaN(score)) {
    EL.scoreText.textContent = `(score: ${score.toFixed(3)})`;
  }
}

async function callHuggingFace(reviewText, token) {
  const url = 'https://api-inference.huggingface.co/models/siebert/sentiment-roberta-large-english';
  const headers = { 'Content-Type': 'application/json' };
  if (token && token.trim()) headers['Authorization'] = `Bearer ${token.trim()}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ inputs: reviewText })
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const detail = isJson && payload && payload.error ? `: ${payload.error}` : '';
    const msg = `API error ${res.status}${detail}`;
    throw new Error(msg);
  }

  return payload;
}

function interpretResponse(payload) {
  // Expected: [[{ label: 'POSITIVE' | 'NEGATIVE', score: number }]]
  let label = null;
  let score = null;

  if (Array.isArray(payload) && Array.isArray(payload[0]) && payload[0][0]) {
    const item = payload[0][0];
    label = item.label;
    score = typeof item.score === 'number' ? item.score : null;
  } else if (Array.isArray(payload) && payload[0] && payload[0].label) {
    // Some deployments return single list
    const item = payload[0];
    label = item.label;
    score = typeof item.score === 'number' ? item.score : null;
  }

  let kind = 'neutral';
  if (label === 'POSITIVE' && score > 0.5) kind = 'positive';
  else if (label === 'NEGATIVE' && score > 0.5) kind = 'negative';

  return { kind, score: typeof score === 'number' ? score : null };
}

async function onAnalyzeClick() {
  clearError();
  if (!STATE.reviews.length) {
    showError('Reviews are not loaded yet.');
    return;
  }

  const token = EL.token.value || '';
  const text = pickRandomReview();

  EL.reviewText.textContent = text;
  updateSentimentUI('neutral', null);
  EL.btn.disabled = true;
  setStatus('Calling Hugging Face Inference API…');

  try {
    const payload = await callHuggingFace(text, token);
    // Handle potential model loading message { "error": "Model ... is currently loading", "estimated_time": ... }
    if (payload && payload.error && /loading/i.test(payload.error)) {
      throw new Error('Model is warming up on Hugging Face. Please try again in a few seconds.');
    }

    const { kind, score } = interpretResponse(payload);
    updateSentimentUI(kind, score);
    clearStatus();
  } catch (err) {
    showError(err.message || 'Unknown error during inference.');
    setStatus('Inference failed.');
  } finally {
    EL.btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  EL.btn.disabled = true;
  loadTSV();
  EL.btn.addEventListener('click', onAnalyzeClick);
});
