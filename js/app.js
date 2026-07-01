(function () {
  'use strict';

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
    return '$' + n.toFixed(2);
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
    els.themeToggle = document.getElementById('themeToggle');
    els.cardModal = document.getElementById('cardModal');
    els.modalContent = document.getElementById('modalContent');
    els.modalClose = document.getElementById('modalClose');
    els.modalBackdrop = document.getElementById('modalBackdrop');

    setupTheme();

    fetch('data.json')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        state.cards = data.cards;
        state.stats = data.stats;
        populateFilters();
        renderStats();
        applyFilters();
        bindEvents();
      })
      .catch(function (err) {
        els.binderGrid.innerHTML = '<p style="color:#b3453e;padding:2rem;">Could not load binder data.</p>';
        console.error(err);
      });
  }

  function setupTheme() {
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    els.themeToggle.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme');
      document.documentElement.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
    });
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
      case 'price-desc': copy.sort(function (a, b) { return b.price - a.price; }); break;
      case 'price-asc': copy.sort(function (a, b) { return a.price - b.price; }); break;
      case 'name-asc': copy.sort(function (a, b) { return a.name.localeCompare(b.name); }); break;
      case 'set-asc': copy.sort(function (a, b) { return a.set.localeCompare(b.set) || b.price - a.price; }); break;
      case 'qty-desc': copy.sort(function (a, b) { return b.qty - a.qty; }); break;
    }
    return copy;
  }

  function renderGrid(list) {
    els.resultCount.textContent = list.length + ' of ' + state.cards.length + ' cards shown';

    if (list.length === 0) {
      els.binderGrid.style.display = 'none';
      els.emptyState.style.display = 'block';
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
          '<span class="modal-badge">' + escapeHtml(card.rarity) + '</span>' +
          '<span class="modal-badge">' + escapeHtml(card.printing) + '</span>' +
          '<span class="modal-badge">' + escapeHtml(card.condition) + '</span>' +
        '</div>' +
        '<div class="modal-price-block">' +
          '<p class="modal-price-label">TCGplayer Market Price</p>' +
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
