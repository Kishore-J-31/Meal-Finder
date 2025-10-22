// API endpoints
const API = {
    CATEGORIES: 'https://www.themealdb.com/api/json/v1/1/categories.php',
    SEARCH: (q) => `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(q)}`,
    FILTER_BY_CATEGORY: (cat) => `https://www.themealdb.com/api/json/v1/1/filter.php?c=${encodeURIComponent(cat)}`,
    LOOKUP: (id) => `https://www.themealdb.com/api/json/v1/1/lookup.php?i=${id}`
};

// App root
const app = document.getElementById('app');
const dropMenu = document.getElementById('dropMenu');
const dropToggle = document.getElementById('dropToggle');

// Simple cache to reduce duplicate network calls in a session
const cache = {};

// Utility helpers
function escapeHtml(s) { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function qs(selector, root = document) { return root.querySelector(selector); }
function qsa(selector, root = document) { return [...root.querySelectorAll(selector)]; }

// Render helpers
function renderLoading(message = 'Loading...') {
    app.innerHTML = `<div style="padding:24px;background:#fff;border-radius:12px;box-shadow:var(--card-shadow)"><p style="margin:0">${message}</p></div>`;
}
function renderError(msg) { app.innerHTML = `<div style="padding:24px;background:#fff;border-radius:12px;box-shadow:var(--card-shadow)"><h3>Error</h3><p style="color:var(--muted)">${escapeHtml(msg)}</p></div>`; }

// Fetch with cache
async function fetchJson(url) {
    if (cache[url]) return cache[url];
    const res = await fetch(url);
    if (!res.ok) throw new Error('Network error');
    const data = await res.json();
    cache[url] = data;
    return data;
}

// Populate dropdown menu with categories
async function populateDropdown() {
    try {
        const data = await fetchJson(API.CATEGORIES);
        const cats = data.categories || [];
        dropMenu.innerHTML = cats.map(c => `<div class="drop-item" role="menuitem" data-cat="${escapeHtml(c.strCategory)}">${escapeHtml(c.strCategory)}</div>`).join('');
    } catch (err) {
        dropMenu.innerHTML = `<div style="padding:10px;color:var(--muted)">Unable to load categories</div>`;
        console.error(err);
    }
}

// Event delegation for dropdown
dropMenu.addEventListener('click', (e) => {
    const target = e.target.closest('.drop-item');
    if (!target) return;
    const cat = target.dataset.cat;
    if (cat) {
        location.hash = `#category/${encodeURIComponent(cat)}`;
        dropMenu.classList.remove('show');
        dropToggle.setAttribute('aria-expanded', 'false');
    }
});

// Toggle dropdown (click outside hides it)
dropToggle.addEventListener('click', (e) => {
    const show = !dropMenu.classList.contains('show');
    dropMenu.classList.toggle('show', show);
    dropToggle.setAttribute('aria-expanded', show ? 'true' : 'false');
});
document.addEventListener('click', (e) => {
    if (!e.target.closest('#navDropdown')) {
        dropMenu.classList.remove('show');
        dropToggle.setAttribute('aria-expanded', 'false');
    }
});

// ------------------ ROUTES --------------------
// routes: #home, #categories, #category/{name}, #meal/{id}
function parseHash() {
    const hash = (location.hash || '#home').replace(/^#/, '');
    const parts = hash.split('/').filter(Boolean);
    return parts;
}

async function router() {
    const parts = parseHash();
    if (parts.length === 0 || parts[0] === 'home') {
        await renderHome();
        return;
    }
    if (parts[0] === 'categories') {
        await renderCategories();
        return;
    }
    if (parts[0] === 'category' && parts[1]) {
        const cat = decodeURIComponent(parts.slice(1).join('/'));
        await renderCategory(cat);
        return;
    }
    if (parts[0] === 'meal' && parts[1]) {
        const id = parts[1];
        await renderMealDetail(id);
        return;
    }
    // fallback: home
    await renderHome();
}

// ------------------ VIEWS --------------------
async function renderHome() {
    document.title = 'Home — Meal Finder';
    // Hero + Search + sample meals (popular categories first category meals)
    renderLoading();
    // build hero + search UI
    app.innerHTML = `
        <section class="hero" aria-hidden="false">
          <div class="hero-content">
            <h2>Find delicious recipes — fast</h2>
            <p>Search by name or pick a category from the navbar.</p>
            <div class="searchbar" style="margin-top:18px;">
              <input id="homeSearch" type="text" placeholder="Search recipes here e.g. Arrabiata or Chicken"/>
              <button id="homeSearchBtn">Search</button>
            </div>
          </div>
        </section>

        <section style="margin-top:28px;">
          <h3 class="section-title">Search results</h3>
          <div id="homeResults" class="cards-grid meals-grid"></div>
        </section>

        <section style="margin-top:28px;">
          <h3 class="section-title">Explore categories</h3>
          <div id="homeCats" class="cards-grid categories-grid"></div>
        </section>
      `;

    // attach events
    const searchInput = qs('#homeSearch'), searchBtn = qs('#homeSearchBtn');
    searchBtn.addEventListener('click', async () => {
        const q = searchInput.value.trim();
        if (!q) return;
        await doSearchAndRender(q, '#homeResults');
    });
    searchInput.addEventListener('keydown', async (e) => { if (e.key === 'Enter') { e.preventDefault(); const q = searchInput.value.trim(); if (q) await doSearchAndRender(q, '#homeResults'); } });

    // populate categories and show a few meals (first category) as samples
    try {
        const data = await fetchJson(API.CATEGORIES);
        const cats = data.categories || [];
        const homeCatsEl = qs('#homeCats');
        homeCatsEl.innerHTML = cats.map(c => `
          <div class="card category-card" data-cat="${escapeHtml(c.strCategory)}">
            <img src="${c.strCategoryThumb}" alt="${escapeHtml(c.strCategory)}">
            <div class="card-body">
              <p class="title">${escapeHtml(c.strCategory)}</p>
              <p class="meta">${escapeHtml((c.strCategoryDescription || '').slice(0, 80))}...</p>
            </div>
          </div>
        `).join('');
        // add click handlers for each category card
        qsa('.category-card', homeCatsEl).forEach(el => {
            el.addEventListener('click', () => {
                const cat = el.dataset.cat;
                if (cat) location.hash = `#category/${encodeURIComponent(cat)}`;
            });
        });

        // show meals from first category as sample
        if (cats[0]) {
            const sample = await fetchJson(API.FILTER_BY_CATEGORY(cats[0].strCategory));
            await renderMeals(sample.meals || [], qs('#homeResults'));
        } else {
            qs('#homeResults').innerHTML = `<p style="color:var(--muted)">No categories found.</p>`;
        }
    } catch (err) {
        console.error(err);
        renderError('Unable to load home content.');
    }
}

// run a search and render into target selector
async function doSearchAndRender(query, targetSelector) {
    const target = qs(targetSelector);
    target.innerHTML = `<div style="padding:18px;background:#fff;border-radius:12px;box-shadow:var(--card-shadow)">Searching for "${escapeHtml(query)}" ...</div>`;
    try {
        const data = await fetchJson(API.SEARCH(query));
        const meals = data.meals || [];
        if (meals.length === 0) {
            target.innerHTML = `<p style="color:var(--muted)">No meals found for "${escapeHtml(query)}".</p>`;
            return;
        }
        await renderMeals(meals, target);
    } catch (err) {
        console.error(err);
        target.innerHTML = `<p style="color:var(--muted)">Failed to search meals.</p>`;
    }
}

async function renderCategories() {
    document.title = 'Categories — Meal Finder';
    renderLoading('Loading categories...');
    try {
        const data = await fetchJson(API.CATEGORIES);
        const cats = data.categories || [];
        app.innerHTML = `
          <div>
            <a class="back-link" href="#home">← Back to Home</a>
            <h3 class="section-title">Categories</h3>
            <div id="categoriesGrid" class="cards-grid categories-grid"></div>
          </div>
        `;
        const grid = qs('#categoriesGrid');
        grid.innerHTML = cats.map(c => `
          <div class="card category-card" data-cat="${escapeHtml(c.strCategory)}">
            <img src="${c.strCategoryThumb}" alt="${escapeHtml(c.strCategory)}">
            <div class="card-body">
              <p class="title">${escapeHtml(c.strCategory)}</p>
              <p class="meta">${escapeHtml((c.strCategoryDescription || '').slice(0, 80))}...</p>
            </div>
          </div>
        `).join('');
        qsa('.category-card', grid).forEach(el => {
            el.addEventListener('click', () => {
                const cat = el.dataset.cat;
                if (cat) location.hash = `#category/${encodeURIComponent(cat)}`;
            });
        });
    } catch (err) {
        console.error(err);
        renderError('Unable to load categories.');
    }
}

async function renderCategory(catName) {
    document.title = `Category: ${catName} — Meal Finder`;
    renderLoading(`Loading "${catName}"...`);
    try {
        const data = await fetchJson(API.FILTER_BY_CATEGORY(catName));
        const meals = data.meals || [];
        app.innerHTML = `
          <div>
            <a class="back-link" href="#categories">← Back to Categories</a>
            <h3 class="section-title">Category: ${escapeHtml(catName)}</h3>
            <div id="categoryMeals" class="cards-grid meals-grid"></div>
          </div>
        `;
        const grid = qs('#categoryMeals');
        if (meals.length === 0) {
            grid.innerHTML = `<p style="color:var(--muted)">No meals found for this category.</p>`;
            return;
        }
        await renderMeals(meals, grid);
    } catch (err) {
        console.error(err);
        renderError('Failed to load category meals.');
    }
}

// meal list renderer (target can be an element or selector)
async function renderMeals(meals, target) {
    if (typeof target === 'string') target = qs(target);
    if (!target) return;
    if (!meals || meals.length === 0) {
        target.innerHTML = `<p style="color:var(--muted)">No meals found</p>`;
        return;
    }
    target.innerHTML = meals.map(m => `
        <div class="card meal-card" data-id="${escapeHtml(m.idMeal)}">
          <img src="${m.strMealThumb}" alt="${escapeHtml(m.strMeal)}">
          <div class="card-body">
            <p class="title">${escapeHtml(m.strMeal)}</p>
            <p class="meta">${escapeHtml(m.strArea || '')} ${m.strCategory ? '· ' + escapeHtml(m.strCategory) : ''}</p>
          </div>
        </div>
      `).join('');
    // attach click handlers
    qsa('.meal-card', target).forEach(el => el.addEventListener('click', () => {
        const id = el.dataset.id;
        if (id) location.hash = `#meal/${id}`;
    }));
}

// meal detail view (full page)
async function renderMealDetail(id) {
    document.title = `Meal — ${id} | Meal Finder`;
    renderLoading('Loading meal details...');
    try {
        const data = await fetchJson(API.LOOKUP(id));
        const meal = (data.meals && data.meals[0]) || null;
        if (!meal) { renderError('Meal not found'); return; }

        // build ingredients list
        const ingredients = [];
        for (let i = 1; i <= 20; i++) {
            const ing = meal[`strIngredient${i}`];
            const measure = meal[`strMeasure${i}`];
            if (ing && ing.trim()) ingredients.push(`${escapeHtml(ing)} ${measure ? ' — ' + escapeHtml(measure) : ''}`);
        }

        app.innerHTML = `
          <div>
            <a class="back-link" href="#home">← Back to Home</a>
            <div style="margin-top:8px;"></div>
            <div class="card" style="padding:18px;">
              <div class="meal-detail">
                <div>
                  <img src="${meal.strMealThumb}" alt="${escapeHtml(meal.strMeal)}">
                </div>
                <div>
                  <h2 style="margin:0 0 8px 0">${escapeHtml(meal.strMeal)}</h2>
                  <p style="margin:0 0 8px 0;color:var(--muted)"><strong>Category:</strong> ${escapeHtml(meal.strCategory)} &nbsp;•&nbsp; <strong>Area:</strong> ${escapeHtml(meal.strArea)}</p>
                  <h4 style="margin-top:8px;margin-bottom:6px">Ingredients</h4>
                  <div class="ingredient-list">
                    ${ingredients.map(i => `<div class="ingredient">${i}</div>`).join('')}
                  </div>

                  <h4 style="margin-top:16px;margin-bottom:6px">Instructions</h4>
                  <p style="white-space:pre-line;color:var(--muted)">${escapeHtml(meal.strInstructions)}</p>

                  ${meal.strYoutube ? `<p style="margin-top:12px;"><a href="${meal.strYoutube}" target="_blank" rel="noopener" style="color:var(--primary);font-weight:700;text-decoration:none">🎬 Watch on YouTube</a></p>` : ''}
                </div>
              </div>
            </div>
          </div>
        `;
    } catch (err) {
        console.error(err);
        renderError('Failed to load meal details.');
    }
}

// ------------------ INIT --------------------
// initial population
(async function init() {
    await populateDropdown();    // fill nav dropdown
    // go to route
    window.addEventListener('hashchange', router);
    // initial route
    if (!location.hash) location.hash = '#home';
    router();
})();
