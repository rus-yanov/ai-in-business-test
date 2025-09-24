// app.js

// ========== STATE ==========
const STATE = {
  reviews: [],
  loading: false,
  history: []
};

// ========== FALLBACK REVIEWS ==========
// Since there is no reviews_test.tsv file, we use a built-in list of reviews.
// This ensures the app works without external files.
const FALLBACK_REVIEWS = [
  "Great product, exactly as described and fast shipping.",
  "Terrible customer service — arrived damaged and no reply.",
  "Quality is excellent, I will buy again.",
  "Not worth the money, very disappointed.",
  "Fast delivery and great packaging.",
  "The size was wrong, but return was easy.",
  "Five stars — works perfectly.",
  "Arrived late and item was scratched.",
  "Amazing value for the price, highly recommended.",
  "Mediocre — expected better performance."
];

// ========== ELEMENT REFERENCES ==========
const EL = {
  status: document.getElementById('status'),
  error: document.getElementById('error'),
  btn: document.getElementById('analyzeBtn'),
  token: document.getElementById('hfToken'),
  reviewText: document.getElementById('reviewText'),
  sentimentIcon: document.getElementById('sentimentIcon'),
  sentimentText: document.getElementById('sentimentText'),
  scoreText: document.getElementById('scoreText'),
  scoreFill: document.getElementById('scoreFill'),
  historyList: document.getElementById('historyList')
};

// ========== STATUS & ERROR ==========
let dotsInterval;
function setStatus(msg) {
  if (!EL.status) return;
  EL.status.style.display = 'flex';
  const span = EL.status.querySelector('span');
  if (span) span.textContent = msg;
  else {
    const s = document.createElement('span');
    s.textContent = msg;
    EL.status.appendChild(s);
  }
}
function setLoadingStatus(msg) {
  clearInterval(dotsInterval);
  let dots = 0;
  setStatus(msg);
  dotsInterval = setInterval(() => {
    dots = (dots + 1) % 4;
    setStatus(msg + '.'.repeat(dots));
  }, 500);
}
function clearStatus() {
  clearInterval(dotsInterval);
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

// ========== DATA LOADING (NO TSV) ==========
// Instead of fetching reviews_test.tsv (which doesn't exist),
// we immediately load the built-in fallback reviews.
async function loadTSV() {
  try {
    setLoadingStatus('Loading sample reviews');
    STATE.reviews = FALLBACK_REVIEWS.slice(); // copy the array
    if (STATE.reviews.length === 0) {
      throw new Error('No fallback reviews available.');
    }
    setStatus(`Loaded ${STATE.reviews.length} sample reviews`);
    EL.btn.disabled = false;
  } catch (err) {
    showError(err.message || String(err));
    setStatus('Unable to load reviews');
    EL.btn.disabled = true;
  }
}

// ========== REVIEW PICKING ==========
function pickRandomReview() {
  const arr = STATE.reviews;
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
}

// ========== SENTIMENT UI ==========
function updateSentimentUI(kind, score) {
  EL.sentimentIcon.className = 'icon';
  EL.scoreText.textContent = '';
  EL.scoreFill.style.width = '0';
  EL.scoreFill.className = 'score-fill';

  if (kind === 'positive') {
    EL.sentimentIcon.classList.add('pos');
    EL.sentimentIcon.innerHTML = '<i class="fa-solid fa-thumbs-up"></i>';
    EL.sentimentText.textContent = 'Positive';
    EL.scoreFill.classList.add('pos-fill');
  } else if (kind === 'negative') {
    EL.sentimentIcon.classList.add('neg');
    EL.sentimentIcon.innerHTML = '<i class="fa-solid fa-thumbs-down"></i>';
    EL.sentimentText.textContent = 'Negative';
    EL.scoreFill.classList.add('neg-fill');
  } else {
    EL.sentimentIcon.classList.add('neu');
    EL.sentimentIcon.innerHTML = '<i class="fa-regular fa-circle-question"></i>';
    EL.sentimentText.textContent = 'Neutral / Uncertain';
    EL.scoreFill.classList.add('neu-fill');
  }

  if (typeof score === 'number' && !Number.isNaN(score)) {
    EL.scoreText.textContent = `(score: ${score.toFixed(3)})`;
    EL.scoreFill.style.width = `${(score * 100).toFixed(1)}%`;
  }
}

// ========== API CALL ==========
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
    throw new Error(`API error ${res.status}${detail}`);
  }

  return payload;
}

// ========== RESPONSE INTERPRETATION ==========
function interpretResponse(payload) {
  let label = null;
  let score = null;

  if (Array.isArray(payload) && Array.isArray(payload[0]) && payload[0][0]) {
    const item = payload[0][0];
    label = item.label;
    score = typeof item.score === 'number' ? item.score : null;
  } else if (Array.isArray(payload) && payload[0] && payload[0].label) {
    const item = payload[0];
    label = item.label;
    score = typeof item.score === 'number' ? item.score : null;
  }

  let kind = 'neutral';
  if (label === 'POSITIVE' && score > 0.5) kind = 'positive';
  else if (label === 'NEGATIVE' && score > 0.5) kind = 'negative';

  return { kind, score: typeof score === 'number' ? score : null };
}

// ========== HISTORY ==========
function addToHistory(text, kind, score) {
  STATE.history.unshift({ text, kind, score });
  if (STATE.history.length > 5) STATE.history.pop();
  renderHistory();
}
function renderHistory() {
  EL.historyList.innerHTML = '';
  for (const item of STATE.history) {
    const div = document.createElement('div');
    div.className = 'history-item';
    const icon = document.createElement('i');
    if (item.kind === 'positive') {
      icon.className = 'fa-solid fa-thumbs-up pos';
    } else if (item.kind === 'negative') {
      icon.className = 'fa-solid fa-thumbs-down neg';
    } else {
      icon.className = 'fa-regular fa-circle-question neu';
    }
    const span = document.createElement('div');
    span.className = 'text';
    span.textContent = item.text;
    const score = document.createElement('div');
    score.className = 'score';
    score.textContent = item.score != null ? item.score.toFixed(3) : '';
    div.appendChild(icon);
    div.appendChild(span);
    div.appendChild(score);
    EL.historyList.appendChild(div);
  }
}

// ========== MAIN ==========
async function analyzeOne() {
  if (STATE.loading) return;
  STATE.loading = true;
  clearError();

  try {
    const review = pickRandomReview();
    if (!review) throw new Error('No reviews loaded.');

    // Animate text fade-out → update → fade-in
    EL.reviewText.classList.add('faded');
    setTimeout(() => {
      EL.reviewText.textContent = review;
      EL.reviewText.classList.remove('faded');
    }, 250);

    setLoadingStatus('Calling Hugging Face API');

    const payload = await callHuggingFace(review, EL.token.value);
    const { kind, score } = interpretResponse(payload);

    updateSentimentUI(kind, score);
    addToHistory(review, kind, score);

    setStatus('Done');
  } catch (err) {
    showError(err.message || String(err));
    setStatus('Error');
  } finally {
    STATE.loading = false;
  }
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
  // Restore token from localStorage
  const saved = localStorage.getItem('hfToken');
  if (saved) EL.token.value = saved;
  EL.token.addEventListener('change', () => {
    localStorage.setItem('hfToken', EL.token.value);
  });

  EL.btn.disabled = true;
  EL.btn.addEventListener('click', analyzeOne);
  loadTSV(); // this now loads fallback reviews
});
