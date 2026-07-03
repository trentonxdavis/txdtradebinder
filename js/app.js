(function () {
  'use strict';

  // Proxies tcgcsv.com and adds the CORS header it doesn't send itself, so
  // this page can call it directly from the browser. See cloudflare-worker/
  // for the proxy's source.
  var TCGCSV_BASE = 'https://txdtradebinder-proxy.txdavis.workers.dev/tcgplayer';

  // tcgcsv's extendedData returns One Piece TCG rarities as short codes
  // rather than full names; map them to the names the UI's rarity styling
  // (see css/style.css .slot-rarity-badge) expects.
  var RARITY_NAMES = {
    C: 'Common',
    UC: 'Uncommon',
    R: 'Rare',
    SR: 'Super Rare',
    SEC: 'Secret Rare',
    L: 'Leader',
    P: 'Promo',
    PR: 'Promo',
    SP: 'Special',
    'DON!!': 'Don!!',
  };

  var state = {
    cards: [],
    stats: {},
    filtered: [],
    search: '',
    setFilter: '',
    rarityFilter: '',
    sort: 'price-desc',
  };

  var els = {};

  function rarityClass(rarity) {
    return 'rarity-' + rarity.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  }

  function formatPrice(n) {
    return n == null ? '—' : '$' + n.toFixed(2);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function init() {
    els.binderGrid = document.getElementById('binderGrid');
    els.emptyState = document.getElementById('emptyState');
    els.resultCount = document.getElementById('resultCount');
    els.searchInput = document.getElementById('searchInput');
    els.setFilter = document.getElementById('setFilter');
    els.rarityFilter = document.getElementById('rarityFilter');
    els.sortSelect = document.getElementById('sortSelect');
    els.statTotalValue = document.getElementById('statTotalValue');
    els.statTotalCards = document.getElementById('statTotalCards');
    els.statTotalQty = document.getElementById('statTotalQty');
    els.statSets = document.getElementById('statSets');
    els.heroKicker = document.getElementById('heroKicker');
    els.themeToggle = document.getElementById('themeToggle');
    els.cardModal = document.getElementById('cardModal');
    els.modalContent = document.getElementById('modalContent');
    els.modalClose = document.getElementById('modalClose');
    els.modalBackdrop = document.getElementById('modalBackdrop');

    setupTheme();
    loadCollection();
  }

  function setupTheme() {
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    els.themeToggle.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme');
      document.documentElement.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
    });
  }

  // --- Live data loading -----------------------------------------------
  // collection.json only lists productId/set/printing/qty (the four things
  // a human has to know to add or remove a card). Everything else — name,
  // card number, rarity, art, and price — is resolved at load time from
  // tcgcsv.com (via the Cloudflare Worker proxy above), so pricing is
  // fresh on every page load.

  function normalizeName(s) {
    return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function fetchJson(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('Request failed (' + res.status + '): ' + url);
      return res.json();
    });
  }

  function fetchCategoryId() {
    return fetchJson(TCGCSV_BASE + '/categories').then(function (data) {
      var match = (data.results || []).find(function (c) {
        return /one piece/i.test(c.name);
      });
      if (!match) throw new Error('Could not find the One Piece Card Game category on tcgcsv.com');
      return match.categoryId;
    });
  }

  function fetchGroups(categoryId) {
    return fetchJson(TCGCSV_BASE + '/' + categoryId + '/groups').then(function (data) {
      return data.results || [];
    });
  }

  function fetchGroupData(categoryId, groupId) {
    return Promise.all([
      fetchJson(TCGCSV_BASE + '/' + categoryId + '/' + groupId + '/products'),
      fetchJson(TCGCSV_BASE + '/' + categoryId + '/' + groupId + '/prices'),
    ]).then(function (results) {
      return { products: results[0].results || [], prices: results[1].results || [] };
    });
  }

  function extendedValue(product, pattern) {
    var fields = product.extendedData || [];
    for (var i = 0; i < fields.length; i += 1) {
      if (pattern.test(fields[i].name || '') || pattern.test(fields[i].displayName || '')) {
        return fields[i].value;
      }
    }
    return '';
  }

  function buildCard(entry, product, priceEntry) {
    var hasPrice = !!priceEntry && (priceEntry.marketPrice != null || priceEntry.midPrice != null);
    var rarityCode = product ? extendedValue(product, /rarity/i) : '';
    var rarity = (RARITY_NAMES[rarityCode] || rarityCode) || 'Unknown';
    // tcgcsv tags "(SP)" alt-art cards with the same rarity code as their
    // regular counterpart (e.g. SR) - the "(SP)" suffix in the product
    // name is the only signal that it's actually the rarer Special variant.
    if (product && /\(SP\)/i.test(product.name)) {
      rarity = 'Special Rare';
    }
    return {
      id: String(entry.productId),
      name: product ? product.name : ('Unknown card #' + entry.productId),
      set: entry.set,
      number: product ? extendedValue(product, /number/i) : '',
      rarity: rarity,
      condition: 'Near Mint',
      printing: entry.printing,
      price: hasPrice ? (priceEntry.marketPrice != null ? priceEntry.marketPrice : priceEntry.midPrice) : null,
      qty: entry.qty,
      photo: (product && product.imageUrl) || ('https://tcgplayer-cdn.tcgplayer.com/product/' + entry.productId + '_in_400x400.jpg'),
      tcgUrl: (product && product.url) || ('https://www.tcgplayer.com/product/' + entry.productId),
    };
  }

  function computeStats(cards) {
    var totalValue = 0;
    var totalQty = 0;
    var sets = {};
    cards.forEach(function (c) {
      if (c.price != null) totalValue += c.price * c.qty;
      totalQty += c.qty;
      sets[c.set] = true;
    });
    return {
      totalValue: totalValue,
      totalCards: cards.length,
      totalQty: totalQty,
      sets: Object.keys(sets).length,
    };
  }

  function loadCollection() {
    showLoadingState();

    fetchJson('collection.json')
      .then(function (collection) {
        return fetchCategoryId().then(function (categoryId) {
          return fetchGroups(categoryId).then(function (groups) {
            var groupIdByName = {};
            groups.forEach(function (g) {
              groupIdByName[normalizeName(g.name)] = g.groupId;
            });

            var uniqueSets = Array.from(new Set(collection.map(function (e) { return e.set; })));
            var groupIds = uniqueSets
              .map(function (setName) {
                var groupId = groupIdByName[normalizeName(setName)];
                if (!groupId) console.warn('No matching TCGplayer set found for "' + setName + '"');
                return groupId;
              })
              .filter(function (id) { return id != null; });

            return Promise.all(groupIds.map(function (groupId) {
              return fetchGroupData(categoryId, groupId);
            })).then(function (groupDataList) {
              var productsById = {};
              var pricesByKey = {};
              groupDataList.forEach(function (data) {
                data.products.forEach(function (p) { productsById[p.productId] = p; });
                data.prices.forEach(function (pr) {
                  pricesByKey[pr.productId + '|' + normalizeName(pr.subTypeName)] = pr;
                });
              });

              return collection.map(function (entry) {
                var product = productsById[entry.productId];
                var priceEntry = pricesByKey[entry.productId + '|' + normalizeName(entry.printing)];
                return buildCard(entry, product, priceEntry);
              });
            });
          });
        });
      })
      .then(function (cards) {
        state.cards = cards;
        state.stats = computeStats(cards);
        populateFilters();
        renderStats();
        applyFilters();
        bindEvents();
      })
      .catch(function (err) {
        showErrorState();
        console.error(err);
      });
  }

  function showLoadingState() {
    els.binderGrid.style.display = 'none';
    els.emptyState.style.display = 'block';
    els.emptyState.textContent = 'Loading live prices from TCGplayer…';
  }

  function showErrorState() {
    els.binderGrid.style.display = 'none';
    els.emptyState.style.display = 'block';
    els.emptyState.textContent = 'Could not load live pricing right now. Try refreshing.';
  }

  function populateFilters() {
    var sets = Array.from(new Set(state.cards.map(function (c) { return c.set; }))).sort();
    var rarities = Array.from(new Set(state.cards.map(function (c) { return c.rarity; }))).sort();

    var setList = els.setFilter.querySelector('.custom-select-list');
    sets.forEach(function (s) {
      var li = document.createElement('li');
      li.className = 'custom-select-option';
      li.setAttribute('role', 'option');
      li.setAttribute('data-value', s);
      li.setAttribute('tabindex', '0');
      li.textContent = s;
      setList.appendChild(li);
    });

    var rarityList = els.rarityFilter.querySelector('.custom-select-list');
    rarities.forEach(function (r) {
      var li = document.createElement('li');
      li.className = 'custom-select-option';
      li.setAttribute('role', 'option');
      li.setAttribute('data-value', r);
      li.setAttribute('tabindex', '0');
      li.textContent = r;
      rarityList.appendChild(li);
    });

    initCustomSelect(els.setFilter, function (value) {
      state.setFilter = value;
      applyFilters();
    });
    initCustomSelect(els.rarityFilter, function (value) {
      state.rarityFilter = value;
      applyFilters();
    });
    initCustomSelect(els.sortSelect, function (value) {
      state.sort = value;
      applyFilters();
    });
  }

  /**
   * Builds a fully custom, click-reliable dropdown out of a
   * `.custom-select` container (button trigger + `<ul>` listbox).
   * Avoids native <select> popups, which can fail to register real
   * mouse clicks inside sandboxed iframe embeds on some platforms.
   */
  function initCustomSelect(root, onChange) {
    var trigger = root.querySelector('.custom-select-trigger');
    var valueEl = root.querySelector('.custom-select-value');
    var list = root.querySelector('.custom-select-list');

    function options() {
      return Array.prototype.slice.call(list.querySelectorAll('.custom-select-option'));
    }

    function close() {
      root.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    }

    function open() {
      closeAllCustomSelects();
      root.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      var selected = list.querySelector('.custom-select-option.is-selected');
      if (selected) selected.focus();
    }

    function toggle() {
      if (root.classList.contains('is-open')) close(); else open();
    }

    function select(optionEl) {
      options().forEach(function (o) {
        o.classList.remove('is-selected');
        o.removeAttribute('aria-selected');
      });
      optionEl.classList.add('is-selected');
      optionEl.setAttribute('aria-selected', 'true');
      valueEl.textContent = optionEl.textContent;
      close();
      onChange(optionEl.getAttribute('data-value'));
    }

    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });

    list.addEventListener('click', function (e) {
      var optionEl = e.target.closest('.custom-select-option');
      if (!optionEl) return;
      e.preventDefault();
      e.stopPropagation();
      select(optionEl);
    });

    list.addEventListener('keydown', function (e) {
      var opts = options();
      var currentIndex = opts.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        var next = opts[Math.min(currentIndex + 1, opts.length - 1)];
        if (next) next.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        var prev = opts[Math.max(currentIndex - 1, 0)];
        if (prev) prev.focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (document.activeElement && document.activeElement.classList.contains('custom-select-option')) {
          select(document.activeElement);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
        trigger.focus();
      }
    });

    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });

    customSelectRegistry.push({ root: root, close: close });
  }

  var customSelectRegistry = [];

  function closeAllCustomSelects() {
    customSelectRegistry.forEach(function (entry) { entry.close(); });
  }

  function renderStats() {
    animateNumber(els.statTotalValue, 0, state.stats.totalValue, true);
    animateNumber(els.statTotalCards, 0, state.stats.totalCards, false);
    animateNumber(els.statTotalQty, 0, state.stats.totalQty, false);
    animateNumber(els.statSets, 0, state.stats.sets, false);
    if (els.heroKicker) {
      els.heroKicker.textContent = 'DIGITAL BINDER · ' + state.stats.totalCards + ' CARDS ON FILE';
    }
  }

  function animateNumber(el, from, to, isCurrency) {
    var duration = 900;
    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var progress = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var val = from + (to - from) * eased;
      el.textContent = isCurrency ? formatPrice(val) : Math.round(val).toLocaleString();
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function bindEvents() {
    els.searchInput.addEventListener('input', function (e) {
      state.search = e.target.value.trim().toLowerCase();
      applyFilters();
    });
    els.modalClose.addEventListener('click', closeModal);
    els.modalBackdrop.addEventListener('click', closeModal);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.custom-select')) closeAllCustomSelects();
    });
  }

  function applyFilters() {
    var list = state.cards.filter(function (c) {
      var matchesSearch = !state.search ||
        c.name.toLowerCase().indexOf(state.search) !== -1 ||
        c.set.toLowerCase().indexOf(state.search) !== -1 ||
        (c.number || '').toLowerCase().indexOf(state.search) !== -1;
      var matchesSet = !state.setFilter || c.set === state.setFilter;
      var matchesRarity = !state.rarityFilter || c.rarity === state.rarityFilter;
      return matchesSearch && matchesSet && matchesRarity;
    });

    list = sortCards(list, state.sort);
    state.filtered = list;
    renderGrid(list);
  }

  function sortCards(list, sortKey) {
    var copy = list.slice();
    switch (sortKey) {
      case 'price-desc': copy.sort(function (a, b) { return (b.price || 0) - (a.price || 0); }); break;
      case 'price-asc': copy.sort(function (a, b) { return (a.price || 0) - (b.price || 0); }); break;
      case 'name-asc': copy.sort(function (a, b) { return a.name.localeCompare(b.name); }); break;
      case 'set-asc': copy.sort(function (a, b) { return a.set.localeCompare(b.set) || (b.price || 0) - (a.price || 0); }); break;
      case 'qty-desc': copy.sort(function (a, b) { return b.qty - a.qty; }); break;
    }
    return copy;
  }

  function renderGrid(list) {
    els.resultCount.textContent = list.length + ' of ' + state.cards.length + ' cards shown';

    if (list.length === 0) {
      els.binderGrid.style.display = 'none';
      els.emptyState.style.display = 'block';
      els.emptyState.textContent = 'No cards match your search. Try a different filter.';
      return;
    }
    els.binderGrid.style.display = 'grid';
    els.emptyState.style.display = 'none';

    var html = list.map(function (c, i) {
      var rClass = rarityClass(c.rarity);
      var delay = Math.min(i * 0.02, 0.4);
      return (
        '<article class="slot" tabindex="0" role="button" data-id="' + c.id + '" ' +
        'aria-label="' + escapeHtml(c.name) + ', ' + formatPrice(c.price) + '" ' +
        'style="animation-delay:' + delay + 's" data-testid="card-slot-' + c.id + '">' +
          '<div class="slot-art">' +
            '<img src="' + c.photo + '" alt="' + escapeHtml(c.name) + ' card art" loading="lazy" data-testid="img-card-' + c.id + '" />' +
            '<div class="foil-sheen"></div>' +
            (c.qty > 1 ? '<span class="slot-qty-badge">x' + c.qty + '</span>' : '') +
            '<span class="slot-rarity-badge ' + rClass + '">' + escapeHtml(c.rarity) + '</span>' +
          '</div>' +
          '<div class="slot-info">' +
            '<h3 class="slot-name" data-testid="text-name-' + c.id + '">' + escapeHtml(c.name) + '</h3>' +
            '<p class="slot-set">' + escapeHtml(c.set) + '</p>' +
            '<div class="slot-footer">' +
              '<span class="slot-price" data-testid="text-price-' + c.id + '">' + formatPrice(c.price) + '</span>' +
              '<span class="slot-number">' + escapeHtml(c.number || '') + '</span>' +
            '</div>' +
          '</div>' +
        '</article>'
      );
    }).join('');

    els.binderGrid.innerHTML = html;

    Array.prototype.forEach.call(els.binderGrid.querySelectorAll('.slot'), function (slot) {
      slot.addEventListener('click', function () { openModal(slot.getAttribute('data-id')); });
      slot.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openModal(slot.getAttribute('data-id'));
        }
      });
    });
  }

  function openModal(id) {
    var card = state.cards.find(function (c) { return c.id === id; });
    if (!card) return;
    var rClass = rarityClass(card.rarity);

    els.modalContent.innerHTML =
      '<div class="modal-art"><img src="' + card.photo + '" alt="' + escapeHtml(card.name) + ' card art" data-testid="img-modal-card" /></div>' +
      '<div class="modal-details">' +
        '<h2 class="modal-title" data-testid="text-modal-name">' + escapeHtml(card.name) + '</h2>' +
        '<p class="modal-set">' + escapeHtml(card.set) + '</p>' +
        '<div class="modal-badges">' +
          '<span class="modal-badge">' + escapeHtml(card.number || '—') + '</span>' +
          '<span class="modal-badge ' + rClass + '">' + escapeHtml(card.rarity) + '</span>' +
          '<span class="modal-badge">' + escapeHtml(card.printing) + '</span>' +
          '<span class="modal-badge">' + escapeHtml(card.condition) + '</span>' +
        '</div>' +
        '<div class="modal-price-block">' +
          '<p class="modal-price-label">TCGplayer Market Price (live)</p>' +
          '<p class="modal-price-value" data-testid="text-modal-price">' + formatPrice(card.price) + '</p>' +
        '</div>' +
        '<p class="modal-qty">Owned: <strong>' + card.qty + '</strong> cop' + (card.qty === 1 ? 'y' : 'ies') + '</p>' +
        '<a class="modal-cta" href="' + card.tcgUrl + '" target="_blank" rel="noopener" data-testid="link-tcgplayer">' +
          'View on TCGplayer' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M17 7H8M17 7v9"/></svg>' +
        '</a>' +
      '</div>';

    els.cardModal.classList.add('open');
    els.modalClose.focus();
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    els.cardModal.classList.remove('open');
    document.body.style.overflow = '';
  }

  document.addEventListener('DOMContentLoaded', init);
})();
