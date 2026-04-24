const PLANNER_STORAGE_KEY = 'travel-continent-planner-v1';
const PHOTO_STORAGE_KEY = 'travel-photos-v1';
let plannerState = [];
let dragState = null;
let photoStorage = {};
let frameRegistry = [];

async function loadJourney() {
  const response = await fetch('./data/journey.json');
  if (!response.ok) {
    throw new Error('Failed to load journey data');
  }
  return response.json();
}

function renderHero(data) {
  document.getElementById('site-title').textContent = data.site.title;
  document.getElementById('site-subtitle').textContent = data.site.subtitle;
  document.getElementById('hero-note').textContent = data.site.heroNote;

  const statHost = document.getElementById('hero-stats');
  statHost.innerHTML = '';
  const stats = [
    { value: data.analysis.countries.length, label: '清单涉及国家 / 地区' },
    { value: data.analysis.futureCount, label: '时间轴目的地' },
    { value: data.analysis.completedCount, label: '已去过国家' },
    { value: '2023—2034', label: '记录跨度' }
  ];

  stats.forEach((stat) => {
    const item = document.createElement('div');
    item.className = 'stat-item';
    item.innerHTML = `
      <span class="stat-value">${stat.value}</span>
      <span class="stat-label">${stat.label}</span>
    `;
    statHost.appendChild(item);
  });
}

function createPill(text, className = '') {
  const pill = document.createElement('span');
  pill.className = `country-pill ${className}`.trim();
  pill.textContent = text;
  return pill;
}

function slugify(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fff-]/g, '');
}

function loadPhotoStorage() {
  try {
    const saved = localStorage.getItem(PHOTO_STORAGE_KEY);
    photoStorage = saved ? JSON.parse(saved) : {};
  } catch {
    photoStorage = {};
  }
}

function savePhotoStorage() {
  localStorage.setItem(PHOTO_STORAGE_KEY, JSON.stringify(photoStorage));
}

function savePlannerState() {
  localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(plannerState));
}

function clonePlanner(planner) {
  return planner.map((group) => ({
    continent: group.continent,
    items: (group.items || []).map((item) => ({
      id: item.id || `${slugify(item.country)}-${Math.random().toString(36).slice(2, 8)}`,
      country: item.country,
      destinations: [...(item.destinations || [])]
    }))
  }));
}

function loadPlannerState(basePlanner) {
  const saved = localStorage.getItem(PLANNER_STORAGE_KEY);
  if (!saved) {
    plannerState = clonePlanner(basePlanner);
    return;
  }

  try {
    const parsed = JSON.parse(saved);
    plannerState = clonePlanner(parsed);
  } catch {
    plannerState = clonePlanner(basePlanner);
  }
}

function addPlannerItem(continent, country, destination) {
  const group = plannerState.find((item) => item.continent === continent);
  if (!group) return;

  const existing = group.items.find((item) => item.country === country.trim());
  if (existing) {
    if (destination && !existing.destinations.includes(destination.trim())) {
      existing.destinations.push(destination.trim());
    }
  } else {
    group.items.push({
      id: `${slugify(country)}-${Date.now()}`,
      country: country.trim(),
      destinations: destination ? [destination.trim()] : []
    });
  }

  savePlannerState();
  renderPlannerBoard();
}

function movePlannerItem(sourceContinent, sourceIndex, targetContinent, targetIndex) {
  const sourceGroup = plannerState.find((item) => item.continent === sourceContinent);
  const targetGroup = plannerState.find((item) => item.continent === targetContinent);
  if (!sourceGroup || !targetGroup) return;

  const [moved] = sourceGroup.items.splice(sourceIndex, 1);
  if (!moved) return;

  if (targetIndex === null || targetIndex === undefined || Number.isNaN(targetIndex)) {
    targetGroup.items.push(moved);
  } else {
    targetGroup.items.splice(targetIndex, 0, moved);
  }

  savePlannerState();
  renderPlannerBoard();
}

function buildPlannerPill(item, continent, index) {
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'planner-pill';
  pill.draggable = true;
  pill.dataset.continent = continent;
  pill.dataset.index = String(index);

  const title = document.createElement('span');
  title.className = 'planner-pill-country';
  title.textContent = item.country;
  pill.appendChild(title);

  if (item.destinations.length) {
    const meta = document.createElement('span');
    meta.className = 'planner-pill-destination';
    meta.textContent = item.destinations.join(' / ');
    pill.appendChild(meta);
  }

  pill.addEventListener('dragstart', () => {
    dragState = { continent, index };
    pill.classList.add('is-dragging');
  });

  pill.addEventListener('dragend', () => {
    dragState = null;
    pill.classList.remove('is-dragging');
    document.querySelectorAll('.planner-dropzone').forEach((node) => node.classList.remove('is-over'));
  });

  pill.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  pill.addEventListener('drop', (event) => {
    event.preventDefault();
    if (!dragState) return;
    movePlannerItem(dragState.continent, dragState.index, continent, index);
  });

  return pill;
}

function renderPlannerBoard() {
  const board = document.getElementById('planner-board');
  board.innerHTML = '';

  plannerState.forEach((group) => {
    const card = document.createElement('article');
    card.className = 'continent-card planner-dropzone';

    card.addEventListener('dragover', (event) => {
      event.preventDefault();
      card.classList.add('is-over');
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('is-over');
    });

    card.addEventListener('drop', (event) => {
      event.preventDefault();
      card.classList.remove('is-over');
      if (!dragState) return;
      movePlannerItem(dragState.continent, dragState.index, group.continent, group.items.length);
    });

    const heading = document.createElement('div');
    heading.className = 'continent-card-head';
    heading.innerHTML = `
      <span class="continent-badge">${group.continent}</span>
      <span class="continent-count">${group.items.length} 个国家</span>
    `;

    const pillWrap = document.createElement('div');
    pillWrap.className = 'planner-pill-wrap';

    group.items.forEach((item, index) => {
      pillWrap.appendChild(buildPlannerPill(item, group.continent, index));
    });

    card.appendChild(heading);
    card.appendChild(pillWrap);
    board.appendChild(card);
  });
}

function setupPlannerForm() {
  const form = document.getElementById('planner-form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const continent = String(formData.get('continent') || '').trim();
    const country = String(formData.get('country') || '').trim();
    const destination = String(formData.get('destination') || '').trim();

    if (!continent || !country) return;
    addPlannerItem(continent, country, destination);
    form.reset();
    document.getElementById('planner-continent').value = continent;
  });
}

function renderYearPills(containerId, groups, options = {}) {
  const host = document.getElementById(containerId);
  host.innerHTML = '';

  groups.forEach((group) => {
    const block = document.createElement('article');
    block.className = 'year-pill-card';

    const top = document.createElement('div');
    top.className = 'year-pill-top';
    top.innerHTML = `<span class="year-pill-badge">${group.year}</span><span class="year-pill-label">${group.label}</span>`;

    const countryRow = document.createElement('div');
    countryRow.className = 'pill-row';
    group.countries.forEach((country) => {
      countryRow.appendChild(createPill(country, options.countryClass || ''));
    });

    const destinationRow = document.createElement('div');
    destinationRow.className = 'pill-row destination-row';
    group.destinations.forEach((destination) => {
      destinationRow.appendChild(createPill(destination, 'is-destination'));
    });

    block.appendChild(top);
    block.appendChild(countryRow);
    block.appendChild(destinationRow);
    host.appendChild(block);
  });
}

function renderCompleted(data) {
  renderYearPills('visited-country-years', data.visitedYears, { countryClass: 'is-visited' });

  const grid = document.getElementById('completed-grid');
  const template = document.getElementById('completed-template');
  grid.innerHTML = '';

  data.completedAnchors.forEach((item) => {
    const fragment = template.content.cloneNode(true);
    fragment.querySelector('.completed-country').textContent = item.country;
    fragment.querySelector('.completed-destination').textContent = item.destination;
    fragment.querySelector('.completed-note').textContent = item.note;
    grid.appendChild(fragment);
  });
}

// ── Photo Frame ────────────────────────────────────────────────────────────────

function buildFrameInner(copy, frameId) {
  const photo = photoStorage[frameId];
  const inner = document.createElement('div');
  inner.className = photo ? 'frame-inner has-photo' : 'frame-inner';

  if (photo) {
    const img = document.createElement('img');
    img.className = 'frame-photo';
    img.src = photo;
    img.alt = '旅行照片';
    const overlay = document.createElement('div');
    overlay.className = 'frame-retake-overlay';
    overlay.innerHTML = '<span>📷 重拍</span>';
    inner.appendChild(img);
    inner.appendChild(overlay);
  } else {
    const badge = document.createElement('span');
    badge.className = 'frame-badge';
    badge.textContent = 'PHOTO';
    const hint = document.createElement('div');
    hint.className = 'frame-upload-hint';
    hint.innerHTML = '<span class="frame-upload-icon">📷</span><span class="frame-upload-text">点击上传照片</span>';
    const copyEl = document.createElement('p');
    copyEl.className = 'frame-copy';
    copyEl.textContent = copy;
    inner.appendChild(badge);
    inner.appendChild(hint);
    inner.appendChild(copyEl);
  }
  return inner;
}

function buildPhotoFrame(copy, frameId) {
  const wrapper = document.createElement('div');
  wrapper.className = 'photo-frame';
  wrapper.dataset.frameId = frameId;

  wrapper.appendChild(buildFrameInner(copy, frameId));

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.className = 'frame-file-input';
  wrapper.appendChild(fileInput);

  wrapper.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1000;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        photoStorage[frameId] = canvas.toDataURL('image/jpeg', 0.75);
        savePhotoStorage();
        const old = wrapper.querySelector('.frame-inner');
        if (old) old.remove();
        wrapper.insertBefore(buildFrameInner(copy, frameId), fileInput);
        const modal = document.getElementById('filmroll-modal');
        if (modal) renderFilmRoll(modal.querySelector('.filmroll-strip'));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
  });

  return wrapper;
}

// ── Film Roll Modal ─────────────────────────────────────────────────────────────

function buildPolaroid(frameData, index) {
  const rotations = [-2.5, -1, 1.5, -1.8, 2, -0.5, 1.2, -2, 0.8, -1.5, 2.2, -0.8, 1.8, -1.2];
  const card = document.createElement('div');
  card.className = 'polaroid';
  card.style.setProperty('--rot', `${rotations[index % rotations.length]}deg`);

  const photoArea = document.createElement('div');
  photoArea.className = 'polaroid-photo';
  const photo = photoStorage[frameData.frameId];
  if (photo) {
    const img = document.createElement('img');
    img.src = photo;
    img.alt = '旅行照片';
    photoArea.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'polaroid-placeholder';
    placeholder.textContent = '✈';
    photoArea.appendChild(placeholder);
  }

  const caption = document.createElement('div');
  caption.className = 'polaroid-caption';
  caption.innerHTML = `
    <span class="polaroid-location">${frameData.entryCountry} · ${frameData.entryDate}</span>
    <span class="polaroid-title">${frameData.entryTitle}</span>
    <span class="polaroid-desc">${frameData.copy}</span>
  `;

  card.appendChild(photoArea);
  card.appendChild(caption);
  return card;
}

function renderFilmRoll(strip) {
  strip.innerHTML = '';
  frameRegistry.forEach((frameData, i) => strip.appendChild(buildPolaroid(frameData, i)));
}

function openFilmRoll() {
  let modal = document.getElementById('filmroll-modal');
  if (modal) {
    renderFilmRoll(modal.querySelector('.filmroll-strip'));
    modal.style.display = 'flex';
    return;
  }

  modal = document.createElement('div');
  modal.className = 'filmroll-overlay';
  modal.id = 'filmroll-modal';

  const header = document.createElement('div');
  header.className = 'filmroll-header';
  header.innerHTML = `
    <span class="filmroll-title">✦ 旅行胶卷</span>
    <span class="filmroll-hint">截图即可保存 ✦</span>
    <button class="filmroll-close" id="filmroll-close">×</button>
  `;

  const strip = document.createElement('div');
  strip.className = 'filmroll-strip';
  renderFilmRoll(strip);

  modal.appendChild(header);
  modal.appendChild(strip);
  document.body.appendChild(modal);

  document.getElementById('filmroll-close').addEventListener('click', () => {
    modal.style.display = 'none';
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });
}

// ── Timeline ───────────────────────────────────────────────────────────────────

function renderTimeline(data) {
  renderYearPills('future-country-years', data.futureYears, { countryClass: 'is-future' });

  const timeline = document.getElementById('timeline');
  const entryTemplate = document.getElementById('timeline-template');
  timeline.innerHTML = '';
  frameRegistry = [];

  data.timeline.forEach((entry) => {
    const fragment = entryTemplate.content.cloneNode(true);
    fragment.querySelector('.entry-date').textContent = `${entry.date} · ${entry.season}`;
    fragment.querySelector('.entry-country').textContent = entry.country;
    fragment.querySelector('.entry-title').textContent = entry.diaryTitle;
    fragment.querySelector('.entry-destination').textContent = entry.destination;
    fragment.querySelector('.entry-wish').textContent = `愿望原句：${entry.wish}`;
    fragment.querySelector('.entry-diary').textContent = entry.diary;

    const frameGrid = fragment.querySelector('.frame-grid');
    entry.frames.forEach((copy, frameIndex) => {
      const frameId = `${slugify(entry.country)}-${slugify(entry.date)}-${frameIndex}`;
      frameRegistry.push({ frameId, copy, entryTitle: entry.diaryTitle, entryDate: entry.date, entryCountry: entry.country });
      frameGrid.appendChild(buildPhotoFrame(copy, frameId));
    });

    timeline.appendChild(fragment);
  });
}

async function init() {
  try {
    const data = await loadJourney();
    loadPhotoStorage();
    renderHero(data);
    loadPlannerState(data.continentPlanner || []);
    setupPlannerForm();
    renderPlannerBoard();
    renderCompleted(data);
    renderTimeline(data);
    document.getElementById('filmroll-btn').addEventListener('click', openFilmRoll);
  } catch (error) {
    console.error(error);
    document.getElementById('site-title').textContent = '网站数据加载失败';
    document.getElementById('site-subtitle').textContent = '请检查 data/journey.json 是否存在。';
  }
}

init();
