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

function renderAnalysis(data) {
  document.getElementById('analysis-source').textContent = data.analysis.source;

  const summary = document.getElementById('analysis-summary');
  summary.innerHTML = '';
  data.analysis.summary.forEach((line) => {
    const li = document.createElement('li');
    li.textContent = line;
    summary.appendChild(li);
  });

  const tags = document.getElementById('country-tags');
  tags.innerHTML = '';
  data.analysis.countries.forEach((country) => {
    const el = document.createElement('span');
    el.textContent = country;
    tags.appendChild(el);
  });
}

function createPill(text, className = '') {
  const pill = document.createElement('span');
  pill.className = `country-pill ${className}`.trim();
  pill.textContent = text;
  return pill;
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

function renderTimeline(data) {
  renderYearPills('future-country-years', data.futureYears, { countryClass: 'is-future' });

  const timeline = document.getElementById('timeline');
  const entryTemplate = document.getElementById('timeline-template');
  const frameTemplate = document.getElementById('frame-template');
  timeline.innerHTML = '';

  data.timeline.forEach((entry) => {
    const fragment = entryTemplate.content.cloneNode(true);
    fragment.querySelector('.entry-date').textContent = `${entry.date} · ${entry.season}`;
    fragment.querySelector('.entry-country').textContent = entry.country;
    fragment.querySelector('.entry-title').textContent = entry.diaryTitle;
    fragment.querySelector('.entry-destination').textContent = entry.destination;
    fragment.querySelector('.entry-wish').textContent = `愿望原句：${entry.wish}`;
    fragment.querySelector('.entry-diary').textContent = entry.diary;

    const frameGrid = fragment.querySelector('.frame-grid');
    entry.frames.forEach((copy) => {
      const frame = frameTemplate.content.cloneNode(true);
      frame.querySelector('.frame-copy').textContent = copy;
      frameGrid.appendChild(frame);
    });

    timeline.appendChild(fragment);
  });
}

async function init() {
  try {
    const data = await loadJourney();
    renderHero(data);
    renderAnalysis(data);
    renderCompleted(data);
    renderTimeline(data);
  } catch (error) {
    console.error(error);
    document.getElementById('site-title').textContent = '网站数据加载失败';
    document.getElementById('site-subtitle').textContent = '请检查 data/journey.json 是否存在。';
  }
}

init();
