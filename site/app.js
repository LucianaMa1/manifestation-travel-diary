const PLANNER_STORAGE_KEY = 'travel-continent-planner-v2';
const PHOTO_STORAGE_KEY = 'travel-photos-v1';
const SITE_ASSET_VERSION = '20260426-upload-placeholder-v7';
const EDIT_MODE_QUERY_KEY = 'edit';
let plannerState = [];
let dragState = null;
let currentData = null;
let photoStorage = {};
let frameRegistry = [];
let editMode = false;

function detectEditMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get(EDIT_MODE_QUERY_KEY) === '1';
}

function applyPageMode() {
  document.body.classList.toggle('is-edit-mode', editMode);
  document.body.classList.toggle('is-view-mode', !editMode);
  const plannerCard = document.querySelector('.planner-card');
  if (plannerCard) {
    plannerCard.hidden = !editMode;
    plannerCard.setAttribute('aria-hidden', String(!editMode));
  }
}

async function loadJourney() {
  const response = await fetch(`./data/journey.json?v=${SITE_ASSET_VERSION}`);
  if (!response.ok) {
    throw new Error('Failed to load journey data');
  }
  return response.json();
}

function renderHero(data) {
  document.getElementById('site-title').textContent = data.site.title;

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

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'upload-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  setTimeout(() => {
    toast.classList.remove('is-visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 4000);
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
  try {
    localStorage.setItem(PHOTO_STORAGE_KEY, JSON.stringify(photoStorage));
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      showToast('浏览器存储空间已满，照片本次会话有效，但刷新后会丢失。建议清理其他网站数据。');
    }
  }
}

function clearSeededFrameCache(data) {
  let changed = false;
  (data.timeline || []).forEach((entry) => {
    if (!entry.frameImages?.length) return;
    entry.frameImages.forEach((presetPhoto, frameIndex) => {
      const versionKey = slugify(String(presetPhoto).split('/').pop() || `seeded-${frameIndex}`);
      const frameId = `${slugify(entry.country)}-${slugify(entry.date)}-${frameIndex}-${versionKey}`;
      if (photoStorage[frameId]) {
        delete photoStorage[frameId];
        changed = true;
      }
    });
  });
  if (changed) savePhotoStorage();
}

function setSaveStatus(message, type = 'neutral') {
  const el = document.getElementById('planner-save-status');
  el.textContent = message || '';
  el.dataset.state = type;
}

function savePlannerState() {
  localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(plannerState));
}

function decodeBase64Unicode(value) {
  return decodeURIComponent(
    Array.from(atob(value))
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join('')
  );
}

function normalizePlanner(planner = []) {
  return planner.map((group) => ({
    continent: group.continent,
    wishlist: (group.wishlist || []).map((item) => ({
      id: item.id || `${slugify(item.country)}-wish-${Math.random().toString(36).slice(2, 8)}`,
      country: item.country,
      destinations: [...(item.destinations || [])]
    })),
    visited: (group.visited || []).map((item) => ({
      id: item.id || `${slugify(item.country)}-visited-${Math.random().toString(36).slice(2, 8)}`,
      country: item.country,
      destinations: [...(item.destinations || [])]
    }))
  }));
}

function savePlannerState() {
  localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(plannerState));
}

function loadPlannerState(basePlanner) {
  const saved = localStorage.getItem(PLANNER_STORAGE_KEY);
  if (!saved) {
    plannerState = normalizePlanner(basePlanner);
    return;
  }

  try {
    plannerState = normalizePlanner(JSON.parse(saved));
  } catch {
    plannerState = normalizePlanner(basePlanner);
  }
}

function getLane(group, lane) {
  return lane === 'visited' ? group.visited : group.wishlist;
}

function addPlannerItem(continent, lane, country, destination) {
  const group = plannerState.find((item) => item.continent === continent);
  if (!group) return;

  const targetLane = getLane(group, lane);
  const existing = targetLane.find((item) => item.country === country.trim());
  if (existing) {
    if (destination && !existing.destinations.includes(destination.trim())) {
      existing.destinations.push(destination.trim());
    }
  } else {
    targetLane.push({
      id: `${slugify(country)}-${lane}-${Date.now()}`,
      country: country.trim(),
      destinations: destination ? [destination.trim()] : []
    });
  }

  savePlannerState();
  renderPlannerBoard();
  setSaveStatus('已添加到当前页面，记得点“保存到 GitHub”同步到网站文件。');
}

function movePlannerItem(sourceContinent, sourceLane, sourceIndex, targetContinent, targetLane, targetIndex) {
  const sourceGroup = plannerState.find((item) => item.continent === sourceContinent);
  const targetGroup = plannerState.find((item) => item.continent === targetContinent);
  if (!sourceGroup || !targetGroup) return;

  const sourceList = getLane(sourceGroup, sourceLane);
  const targetList = getLane(targetGroup, targetLane);
  const [moved] = sourceList.splice(sourceIndex, 1);
  if (!moved) return;

  moved.id = `${slugify(moved.country)}-${targetLane}-${Date.now()}`;

  if (targetIndex === null || targetIndex === undefined || Number.isNaN(targetIndex)) {
    targetList.push(moved);
  } else {
    targetList.splice(targetIndex, 0, moved);
  }

  savePlannerState();
  renderPlannerBoard();
  setSaveStatus('已调整国家位置，记得点“保存到 GitHub”同步到网站文件。');
}

function buildPlannerPill(item, continent, lane, index) {
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = `planner-pill ${lane === 'visited' ? 'is-visited' : 'is-wishlist'}`;
  pill.draggable = true;
  pill.dataset.continent = continent;
  pill.dataset.lane = lane;
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
    dragState = { continent, lane, index };
    pill.classList.add('is-dragging');
  });

  pill.addEventListener('dragend', () => {
    dragState = null;
    pill.classList.remove('is-dragging');
    document.querySelectorAll('.lane-dropzone').forEach((node) => node.classList.remove('is-over'));
  });

  pill.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  pill.addEventListener('drop', (event) => {
    event.preventDefault();
    if (!dragState) return;
    movePlannerItem(dragState.continent, dragState.lane, dragState.index, continent, lane, index);
  });

  return pill;
}

function buildLane(continent, lane, items) {
  const laneCard = document.createElement('div');
  laneCard.className = `planner-lane lane-dropzone ${lane === 'visited' ? 'visited-lane' : 'wishlist-lane'}`;
  laneCard.dataset.continent = continent;
  laneCard.dataset.lane = lane;

  laneCard.addEventListener('dragover', (event) => {
    event.preventDefault();
    laneCard.classList.add('is-over');
  });

  laneCard.addEventListener('dragleave', () => {
    laneCard.classList.remove('is-over');
  });

  laneCard.addEventListener('drop', (event) => {
    event.preventDefault();
    laneCard.classList.remove('is-over');
    if (!dragState) return;
    movePlannerItem(dragState.continent, dragState.lane, dragState.index, continent, lane, items.length);
  });

  const label = document.createElement('div');
  label.className = 'planner-lane-head';
  label.innerHTML = `
    <span class="planner-lane-title">${lane === 'visited' ? '已经去过' : '心愿单'}</span>
    <span class="planner-lane-count">${items.length}</span>
  `;

  const wrap = document.createElement('div');
  wrap.className = 'planner-pill-wrap';
  items.forEach((item, index) => wrap.appendChild(buildPlannerPill(item, continent, lane, index)));

  laneCard.appendChild(label);
  laneCard.appendChild(wrap);
  return laneCard;
}

function renderPlannerBoard() {
  const board = document.getElementById('planner-board');
  board.innerHTML = '';

  plannerState.forEach((group) => {
    const card = document.createElement('article');
    card.className = 'continent-card';

    const heading = document.createElement('div');
    heading.className = 'continent-card-head';
    heading.innerHTML = `
      <span class="continent-badge">${group.continent}</span>
      <span class="continent-count">${group.wishlist.length + group.visited.length} 个国家</span>
    `;

    const lanes = document.createElement('div');
    lanes.className = 'planner-lanes';
    lanes.appendChild(buildLane(group.continent, 'wishlist', group.wishlist));
    lanes.appendChild(buildLane(group.continent, 'visited', group.visited));

    card.appendChild(heading);
    card.appendChild(lanes);
    board.appendChild(card);
  });
}

function setupPlannerForm() {
  const form = document.getElementById('planner-form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const continent = String(formData.get('continent') || '').trim();
    const lane = String(formData.get('lane') || 'wishlist').trim();
    const country = String(formData.get('country') || '').trim();
    const destination = String(formData.get('destination') || '').trim();

    if (!continent || !country) return;
    addPlannerItem(continent, lane, country, destination);
    form.reset();
    document.getElementById('planner-continent').value = continent;
    document.getElementById('planner-lane').value = lane || 'wishlist';
  });
}

async function savePlannerToGitHub() {
  const token = document.getElementById('github-token').value.trim();
  if (!token) {
    setSaveStatus('先粘贴一个只授权这个仓库的 fine-grained GitHub token。', 'error');
    return;
  }

  setSaveStatus('正在把最新旅行地图写回 GitHub…', 'saving');

  try {
    const { owner, repo, branch, path } = currentData.plannerConfig;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json'
    };

    const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
    const currentFileResp = await fetch(getUrl, { headers });
    if (!currentFileResp.ok) {
      throw new Error('读取 GitHub 文件失败，请检查 token 权限。');
    }

    const currentFile = await currentFileResp.json();
    const latestRemoteData = JSON.parse(decodeBase64Unicode(currentFile.content || ''));
    const nextData = { ...latestRemoteData, continentPlanner: plannerState };
    const content = JSON.stringify(nextData, null, 2) + '\n';
    const encoded = btoa(unescape(encodeURIComponent(content)));

    const putResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'chore: update interactive continent planner',
        content: encoded,
        sha: currentFile.sha,
        branch
      })
    });

    if (!putResp.ok) {
      const errText = await putResp.text();
      throw new Error(`保存失败：${errText}`);
    }

    currentData = nextData;
    setSaveStatus('已成功写入 GitHub 数据文件。GitHub Pages 几十秒后会自动更新。', 'success');
  } catch (error) {
    console.error(error);
    setSaveStatus(error.message || '保存到 GitHub 失败。', 'error');
  }
}

function setupSaveButton() {
  const button = document.getElementById('save-github');
  button.addEventListener('click', savePlannerToGitHub);
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
}

// ── Photo Frame ────────────────────────────────────────────────────────────────

function buildFrameInner(copy, frameId, presetPhoto = '', canUpload = false) {
  const photo = photoStorage[frameId] || presetPhoto;
  const inner = document.createElement('div');
  inner.className = photo ? 'frame-inner has-photo' : 'frame-inner';

  if (photo) {
    const img = document.createElement('img');
    img.className = 'frame-photo';
    img.src = photo;
    img.alt = '旅行照片';
    inner.appendChild(img);
    if (editMode) {
      const overlay = document.createElement('div');
      overlay.className = 'frame-retake-overlay';
      overlay.innerHTML = '<span>📷 重拍</span>';
      inner.appendChild(overlay);
    }
  } else {
    const badge = document.createElement('span');
    badge.className = 'frame-badge';
    badge.textContent = 'PHOTO';
    const copyEl = document.createElement('p');
    copyEl.className = 'frame-copy';
    copyEl.textContent = copy;
    inner.appendChild(badge);
    if (canUpload) {
      const hint = document.createElement('div');
      hint.className = 'frame-upload-hint';
      hint.innerHTML = '<span class="frame-upload-icon">📷</span><span class="frame-upload-text">点击上传照片</span>';
      inner.appendChild(hint);
    }
    inner.appendChild(copyEl);
  }
  return inner;
}

function buildPhotoFrame(copy, frameId, presetPhoto = '') {
  const wrapper = document.createElement('div');
  const canUpload = editMode || !presetPhoto;
  wrapper.className = 'photo-frame';
  wrapper.dataset.frameId = frameId;
  wrapper.classList.toggle('is-editable', canUpload);

  wrapper.appendChild(buildFrameInner(copy, frameId, presetPhoto, canUpload));

  if (!canUpload) {
    return wrapper;
  }

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
        const MAX = 800;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        photoStorage[frameId] = canvas.toDataURL('image/jpeg', 0.72);
        // Update DOM first — independent of storage success
        const old = wrapper.querySelector('.frame-inner');
        if (old) old.remove();
        wrapper.insertBefore(buildFrameInner(copy, frameId, presetPhoto, canUpload), fileInput);
        const modal = document.getElementById('filmroll-modal');
        if (modal) renderFilmRoll(modal.querySelector('.filmroll-strip'));
        savePhotoStorage();
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
  const photo = photoStorage[frameData.frameId] || frameData.presetPhoto;
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
    fragment.querySelector('.entry-diary').textContent = entry.diary;

    const frameGrid = fragment.querySelector('.frame-grid');
    entry.frames.forEach((copy, frameIndex) => {
      const presetPhoto = entry.frameImages?.[frameIndex] || '';
      const versionKey = presetPhoto ? slugify(String(presetPhoto).split('/').pop() || `seeded-${frameIndex}`) : 'upload-only';
      const frameId = `${slugify(entry.country)}-${slugify(entry.date)}-${frameIndex}-${versionKey}`;
      frameRegistry.push({ frameId, copy, entryTitle: entry.diaryTitle, entryDate: entry.date, entryCountry: entry.country, presetPhoto });
      frameGrid.appendChild(buildPhotoFrame(copy, frameId, presetPhoto));
    });

    timeline.appendChild(fragment);
  });
}

async function init() {
  try {
    editMode = detectEditMode();
    applyPageMode();
    const data = await loadJourney();
    loadPhotoStorage();
    clearSeededFrameCache(data);
    currentData = data;
    renderHero(data);
    if (editMode) {
      loadPlannerState(data.continentPlanner || []);
      setupPlannerForm();
      setupSaveButton();
      renderPlannerBoard();
    }
    renderCompleted(data);
    renderTimeline(data);
    document.getElementById('filmroll-btn').addEventListener('click', openFilmRoll);
  } catch (error) {
    console.error(error);
    document.getElementById('site-title').textContent = '网站数据加载失败';
  }
}

init();
