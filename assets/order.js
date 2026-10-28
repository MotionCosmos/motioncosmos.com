// Ordering on motioncosmos.com: the order form (bestellen.html, en/order.html) and the page Mollie
// sends people back to after paying (bedankt.html, en/thanks.html). Both talk to the order helper,
// a Google Apps Script web app in Sem's account (backend/Code.gs). The helper works out the price
// again itself and makes the Mollie payment link; the numbers here are only for showing the total.
(function () {
  'use strict';

  var TIERS = { video: 149, pack: 590, monthly: 390 }; // excl. btw; must match backend/Code.gs
  var EU = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV',
    'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
  var lang = (document.documentElement.lang || 'nl').slice(0, 2) === 'en' ? 'en' : 'nl';
  var T = {
    nl: {
      locale: 'nl-NL',
      names: { video: 'Nieuwe video', pack: 'Campagnepakket', monthly: 'Elke maand (eerste maand)' },
      vat21: 'Btw 21%', vatRc: 'Btw verlegd', vatNone: 'Geen Nederlandse btw', vatPick: 'Btw', pickCountry: 'Kies een land',
      pay: 'Betaal ', payPlain: 'Betalen',
      noteMonthly: 'Je betaalt nu de eerste maand. Daarna ontvang je aan het begin van elke maand een betaallink.',
      noteRc: 'Je bedrijf zit in een ander EU-land, dus de btw wordt verlegd. Vul je btw-nummer in; we controleren het in VIES.',
      noteNone: 'Je bedrijf zit buiten de EU, dus je betaalt geen Nederlandse btw. Vul het belasting- of registratienummer van je bedrijf in.',
      vatOptional: '(niet verplicht)', vatRequired: '(verplicht)',
      vatName: 'Btw-nummer', regName: 'Belasting- of registratienummer',
      vatExample: { nl: 'NL123456789B01', eu: 'Met landcode, bijvoorbeeld DE123456789', none: '' },
      busy: 'Even geduld…',
      errFields: 'Vul de velden met een rode rand in.',
      errTerms: 'Ga akkoord met de voorwaarden om te betalen.',
      errNetwork: 'Het versturen lukte niet. Probeer het opnieuw, of mail je bestelling naar '
    },
    en: {
      locale: 'en-IE',
      names: { video: 'New video', pack: 'Campaign pack', monthly: 'Every month (first month)' },
      vat21: 'VAT 21%', vatRc: 'VAT reverse-charged', vatNone: 'No Dutch VAT', vatPick: 'VAT', pickCountry: 'Choose a country',
      pay: 'Pay ', payPlain: 'Pay',
      noteMonthly: 'You pay the first month now. After that, you receive a payment link at the start of each month.',
      noteRc: 'Your company is in another EU country, so the VAT is reverse-charged. Fill in your VAT number; we check it in VIES.',
      noteNone: "Your company is outside the EU, so you pay no Dutch VAT. Fill in your company's tax or registration number.",
      vatOptional: '(optional)', vatRequired: '(required)',
      vatName: 'VAT number', regName: 'Tax or company registration number',
      vatExample: { nl: 'NL123456789B01', eu: 'With the country code, for example DE123456789', none: '' },
      busy: 'One moment…',
      errFields: 'Please fill in the fields with a red border.',
      errTerms: 'Please agree to the terms to pay.',
      errNetwork: "Sending didn't work. Please try again, or email your order to "
    }
  }[lang];

  function money(n) {
    return new Intl.NumberFormat(T.locale, { style: 'currency', currency: 'EUR' }).format(n);
  }

  function vatCase(country) {
    if (!country) return '';
    if (country === 'NL') return 'nl';
    if (EU.indexOf(country) >= 0) return 'eu';
    return 'none';
  }

  // ---------------------------------------------------------------- the order form
  var form = document.getElementById('order');
  if (form) {
    var $ = function (sel) { return form.querySelector(sel); };
    var sum = function (key) { return form.querySelector('[data-sum="' + key + '"]'); };
    var params = new URLSearchParams(location.search);
    var preset = params.get('pakket') || params.get('package');
    if (preset && TIERS[preset]) $('input[name="tier"][value="' + preset + '"]').checked = true;

    var update = function () {
      var tier = ($('input[name="tier"]:checked') || {}).value || 'video';
      var country = $('select[name="country"]').value;
      var vc = vatCase(country);
      var excl = TIERS[tier];
      var vat = vc === 'nl' ? Math.round(excl * 21) / 100 : 0;
      var total = excl + vat;
      sum('name').textContent = T.names[tier];
      sum('excl').textContent = money(excl);
      sum('vatLabel').textContent = vc === 'nl' ? T.vat21 : vc === 'eu' ? T.vatRc : vc === 'none' ? T.vatNone : T.vatPick;
      sum('vat').textContent = vc ? money(vat) : T.pickCountry;
      sum('total').textContent = money(total);
      sum('button').textContent = vc ? T.pay + money(total) : T.payPlain;
      var notes = [];
      if (tier === 'monthly') notes.push(T.noteMonthly);
      if (vc === 'eu') notes.push(T.noteRc);
      if (vc === 'none') notes.push(T.noteNone);
      sum('note').hidden = !notes.length;
      sum('note').textContent = notes.join(' ');
      // the VAT number: optional for Dutch companies, required in other EU countries; outside the EU a tax or
      // company registration number instead, which shows the buyer is a business
      var vatInput = $('input[name="vatId"]');
      vatInput.required = vc === 'eu' || vc === 'none';
      vatInput.placeholder = T.vatExample[vc || 'eu'];
      form.querySelector('[data-vat-label]').textContent = vc === 'none' ? T.regName : T.vatName;
      form.querySelector('[data-vat-note]').textContent = vatInput.required ? T.vatRequired : T.vatOptional;
      form.querySelectorAll('.choice').forEach(function (c) {
        c.classList.toggle('on', c.querySelector('input').checked);
      });
    };
    form.addEventListener('change', update);
    form.addEventListener('input', function (e) {
      if (e.target.classList.contains('invalid') && e.target.value.trim()) e.target.classList.remove('invalid');
    });
    update();

    var error = form.querySelector('.error');
    var showError = function (msg, withMail) {
      error.hidden = false;
      error.textContent = msg;
      if (withMail) {
        var a = document.createElement('a');
        a.href = 'mailto:' + form.dataset.email;
        a.textContent = form.dataset.email;
        error.appendChild(a);
        error.appendChild(document.createTextNode('.'));
      }
    };

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      error.hidden = true;
      var bad = [];
      form.querySelectorAll('input[required], select[required], textarea[required]').forEach(function (el) {
        if (el.type === 'checkbox' || el.closest('[hidden]')) return;
        var ok = el.value.trim() !== '' && (el.type !== 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim()));
        el.classList.toggle('invalid', !ok);
        el.setAttribute('aria-invalid', ok ? 'false' : 'true');
        if (!ok) bad.push(el);
      });
      if (bad.length) { showError(T.errFields); bad[0].focus(); return; }
      if (!$('input[name="terms"]').checked) { showError(T.errTerms); $('input[name="terms"]').focus(); return; }

      var data = { action: 'order', lang: lang };
      ['company', 'name', 'email', 'website', 'country', 'street', 'postcode', 'city', 'vatId', 'brief', 'hp']
        .forEach(function (k) { var el = form.elements[k]; data[k] = el ? el.value.trim() : ''; });
      data.tier = $('input[name="tier"]:checked').value;
      data.terms = true;

      var button = form.querySelector('.pay');
      var label = sum('button').textContent;
      button.disabled = true;
      sum('button').textContent = T.busy;
      // text/plain keeps this a simple request, which the Apps Script web app accepts from any site
      fetch(form.dataset.endpoint, { method: 'POST', body: JSON.stringify(data) })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res && res.ok && res.checkoutUrl) { location.href = res.checkoutUrl; return; }
          button.disabled = false;
          sum('button').textContent = label;
          showError((res && res.error) || T.errNetwork, !(res && res.error) || res.contact);
        })
        .catch(function () {
          button.disabled = false;
          sum('button').textContent = label;
          showError(T.errNetwork, true);
        });
    });
  }

  // ---------------------------------------------------------------- back from Mollie
  var thanks = document.getElementById('thanks');
  if (thanks) {
    var q = new URLSearchParams(location.search);
    var order = q.get('order');
    var token = q.get('t');
    var show = function (state, res) {
      thanks.querySelectorAll('[data-state]').forEach(function (el) { el.hidden = el.dataset.state !== state; });
      if (res && state === 'paid') {
        thanks.querySelector('[data-f="package"]').textContent = res.package || '';
        thanks.querySelector('[data-f="total"]').textContent = res.total ? money(res.total) : '';
      }
      if (res && state === 'open' && res.checkoutUrl) thanks.querySelector('[data-f="retry"]').href = res.checkoutUrl;
    };
    if (!order || !token) { show('unknown'); return; }
    var tries = 0;
    var check = function () {
      tries += 1;
      var url = thanks.dataset.endpoint + '?action=status&lang=' + lang + '&order=' + encodeURIComponent(order) + '&t=' + encodeURIComponent(token);
      fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.status === 'paid') return show('paid', res);
          if (res.status === 'open' && tries < 4) return setTimeout(check, 2500); // Mollie can take a few seconds
          if (res.status === 'open') return show('open', res);
          show('unknown');
        })
        .catch(function () { if (tries < 3) setTimeout(check, 2500); else show('unknown'); });
    };
    check();
  }
})();
