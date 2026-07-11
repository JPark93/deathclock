(function() {
    'use strict';

    // =========================================================================
    // Closure-scoped state — all user data lives in memory only, never persisted
    // to localStorage, sessionStorage, or any other durable storage.
    // =========================================================================
    let userData = null;
    let worker = null;
    let countdownInterval = null;
    let lifeExpectancyData = null;      // raw JSON from fetch
    let sortedCountries = [];           // alphabetically-sorted country array (mirrors dropdown order)
    let quoteInterval = null;
    let expiryDate = null;
    let birthDateObj = null;
    let countdownTickTimeout = null;
    let fluidSimulation = null;

    // =========================================================================
    // Quotes pool — a collection of philosophical reflections on mortality
    // =========================================================================
    var QUOTES = [
        { text: "Death is not the greatest loss in life. The greatest loss is what dies inside us while we live.", author: "Norman Cousins" },
        { text: "Our days are numbered. One of the primary goals in our lives should be to have more of them.", author: "Henry Rollins" },
        { text: "The fear of death follows from the fear of life. A man who lives fully is prepared to die at any time.", author: "Mark Twain" },
        { text: "Death is the dropping of the flower that the fruit may swell.", author: "Henry Ward Beecher" },
        { text: "Life is a great sunrise. I do not see why death should not be an even greater one.", author: "Vladimir Nabokov" },
        { text: "To the well-organized mind, death is but the next great adventure.", author: "J.K. Rowling" },
        { text: "Death is nothing, but to live defeated and inglorious is to die daily.", author: "Napoleon Bonaparte" },
        { text: "The goal isn't to live forever, the goal is to create something that will.", author: "Chuck Palahniuk" },
        { text: "Death is not the opposite of life, but a part of it.", author: "Haruki Murakami" },
        { text: "LMAO! U gonna die soon!", author: "Creator of Site" },
        { text: "A man who dares to waste one hour of time has not discovered the value of life.", author: "Charles Darwin" }
    ];

    // =========================================================================
    // DOM element references — cached once at initialization
    // =========================================================================
    var DOM = {};

    function cacheDomElements() {
        DOM.formSection       = document.getElementById('form-section');
        DOM.form              = document.getElementById('death-form');
        DOM.birthDate         = document.getElementById('birth-date');
        DOM.sex               = document.getElementById('sex');
        DOM.country           = document.getElementById('country');
        DOM.regionGroup       = document.getElementById('region-group');
        DOM.regionLabel       = document.getElementById('region-label');
        DOM.region            = document.getElementById('region');
        DOM.smoker            = document.getElementById('smoker');
        DOM.exercise          = document.getElementById('exercise');
        DOM.alcohol           = document.getElementById('alcohol');
        DOM.bmi               = document.getElementById('bmi');
        DOM.resultsSection    = document.getElementById('results-section');
        DOM.cdYears           = document.getElementById('cd-years');
        DOM.cdMonths          = document.getElementById('cd-months');
        DOM.countdownDays     = document.getElementById('countdown-days');
        DOM.cdHours           = document.getElementById('cd-hours');
        DOM.cdMinutes         = document.getElementById('cd-minutes');
        DOM.cdSeconds         = document.getElementById('cd-seconds');
        DOM.countdownTime     = document.getElementById('countdown-time');
        DOM.timeLived         = document.getElementById('time-lived');
        DOM.expiryDate        = document.getElementById('expiry-date');
        DOM.progressBarFill   = document.getElementById('progress-bar-fill') || document.getElementById('progress-fill');
        DOM.progressBar       = document.getElementById('life-vial');
        DOM.fluidCanvas       = document.getElementById('fluid-canvas');
        DOM.progressPercent   = document.getElementById('progress-percent');
        DOM.breakdownSection  = document.querySelector('.breakdown-section');
        DOM.breakdownBody     = document.getElementById('breakdown-body');
        DOM.quoteDisplay      = document.getElementById('quote-display');
        DOM.errorMessage      = document.getElementById('error-message');
        DOM.clearButton       = document.getElementById('clear-btn');
        DOM.editButton        = document.getElementById('edit-details');
        DOM.baseLifeExp       = document.getElementById('base-le') || document.getElementById('base-life-exp');
        DOM.adjLifeExp        = document.getElementById('adjusted-le') || document.getElementById('adj-life-exp');
    }

    // =========================================================================
    // Initialize — fires on DOMContentLoaded
    // =========================================================================
    function init() {
        cacheDomElements();
        fluidSimulation = createFluidSimulation(DOM.fluidCanvas);

        // Fetch static life-expectancy data (new format: { countries: [...] })
        fetch('data/life_expectancy.json')
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('Failed to load life expectancy data (HTTP ' + response.status + ')');
                }
                return response.json();
            })
            .then(function(data) {
                lifeExpectancyData = data;
                populateCountryDropdown(data);
            })
            .catch(function(err) {
                console.error('Data fetch failed:', err.message);
                showError('Could not load life-expectancy data. Please ensure the app is served over HTTP (not file://).');
            });

        // Initialize Web Worker for heavy calculation off the main thread
        initWorker();

        // Wire up event listeners
        DOM.form.addEventListener('submit', handleFormSubmit);
        DOM.country.addEventListener('change', updateRegionDropdown);
        DOM.clearButton.addEventListener('click', clearAllData);
        DOM.editButton.addEventListener('click', editDetails);

        if (DOM.breakdownSection && window.matchMedia('(max-width: 480px)').matches) {
            DOM.breakdownSection.removeAttribute('open');
        }

        // Show a random quote immediately
        showRandomQuote();
    }

    // =========================================================================
    // Populate the country <select> from fetched life-expectancy data,
    // sorted alphabetically by country name.  New format: {code, name, years}.
    // Also stores a parallel array (sortedCountries) mirroring dropdown order.
    // =========================================================================
    function populateCountryDropdown(data) {
        var countries = data.countries || [];

        // Sort countries alphabetically by name
        sortedCountries = countries.slice().sort(function(a, b) {
            return a.name.localeCompare(b.name);
        });

        // Keep the default placeholder option
        DOM.country.innerHTML = '<option value="">Select your country...</option>';

        for (var i = 0; i < sortedCountries.length; i++) {
            var opt = document.createElement('option');
            opt.value = i;                           // store array index as value
            opt.textContent = sortedCountries[i].name;
            DOM.country.appendChild(opt);

            if (sortedCountries[i].code === 'USA') {
                opt.selected = true;
                opt.defaultSelected = true;
            }
        }

        updateRegionDropdown();
    }

    function updateRegionDropdown() {
        var countryIndex = DOM.country.value;
        var country = countryIndex === '' ? null : sortedCountries[parseInt(countryIndex)];
        var regions = country && country.regions;

        DOM.region.innerHTML = '<option value="">Use national estimate</option>';

        if (!regions || !regions.items || !regions.items.length) {
            DOM.region.disabled = true;
            DOM.regionGroup.hidden = true;
            return;
        }

        DOM.regionLabel.textContent = regions.label || 'Region';
        for (var i = 0; i < regions.items.length; i++) {
            var opt = document.createElement('option');
            opt.value = i;
            opt.textContent = regions.items[i].name;
            DOM.region.appendChild(opt);
        }

        DOM.region.disabled = false;
        DOM.regionGroup.hidden = false;
    }

    // =========================================================================
    // Web Worker initialization
    // =========================================================================
    function initWorker() {
        if (worker) {
            worker.terminate();
        }

        worker = new Worker('js/worker.js');

        worker.onmessage = function(e) {
            var msg = e.data;
            if (msg.action === 'result') {
                displayResults(msg.result);
            } else if (msg.action === 'error') {
                showError(msg.message || msg.error || 'Calculation error occurred.');
            }
        };

        worker.onerror = function(e) {
            showError('Worker error: ' + e.message);
        };
    }

    // =========================================================================
    // Form submission handler — validates input, packages data, dispatches to worker
    // =========================================================================
    function handleFormSubmit(e) {
        e.preventDefault();

        // ---- Validation ----
        var birthDateValue = DOM.birthDate.value;
        var sexValue = DOM.sex.value;
        var countryIndex = DOM.country.value;

        if (!birthDateValue) {
            showError('Please enter your birth date.');
            return;
        }
        if (new Date(birthDateValue) > new Date()) {
            showError('Birth date cannot be in the future.');
            return;
        }
        if (!sexValue) {
            showError('Please select your sex.');
            return;
        }
        if (countryIndex === '') {
            showError('Please select your country.');
            return;
        }

        // ---- Collect form data ----
        var smokerValue = DOM.smoker.checked || DOM.smoker.value === 'true';
        var exerciseValue = DOM.exercise.value;
        var alcoholValue = DOM.alcohol.value;
        var bmiValue = DOM.bmi.value;

        // Extract birth year as integer from the date input (YYYY-MM-DD)
        var parsedBirthDate = new Date(birthDateValue);
        var birthYear = parsedBirthDate.getFullYear();

        // Look up the full country object (with years array) from sorted index
        var countryObj = sortedCountries[parseInt(countryIndex)];

        if (!countryObj) {
            showError('Country data not found. Please try again.');
            return;
        }

        var regionObj = null;
        if (DOM.region.value !== '' && countryObj.regions && countryObj.regions.items) {
            var selectedRegion = countryObj.regions.items[parseInt(DOM.region.value)];
            if (selectedRegion) {
                regionObj = {
                    name: selectedRegion.name,
                    years: selectedRegion.years,
                    source: countryObj.regions.source
                };
            }
        }

        birthDateObj = parsedBirthDate;

        userData = {
            birthDate: birthDateValue,
            sex: sexValue,
            country: countryObj,   // full object including years array
            region: regionObj,
            lifestyle: {
                smoker: smokerValue,
                exercise: exerciseValue,
                alcohol: alcoholValue,
                bmi: bmiValue
            }
        };

        // ---- Dispatch to Web Worker (includes birthYear) ----
        worker.postMessage({
            action: 'calculate',
            data: {
                birthDate: birthDateValue,
                birthYear: birthYear,
                sex: sexValue,
                country: countryObj,
                region: regionObj,
                lifestyle: {
                    smoker: smokerValue,
                    exercise: exerciseValue,
                    alcohol: alcoholValue,
                    bmi: bmiValue
                }
            }
        });
    }

    // =========================================================================
    // Display results — called when the worker posts back a calculation result
    // =========================================================================
    function displayResults(result) {
        DOM.formSection.classList.add('hidden');

        // Show the results section with a fade-in
        DOM.resultsSection.classList.remove('hidden');
        DOM.resultsSection.classList.add('visible');
        DOM.resultsSection.classList.add('fade-in');

        // Store the expiry date for the countdown
        expiryDate = new Date(result.expiryDate);

        if (DOM.expiryDate && !isNaN(expiryDate.getTime())) {
            DOM.expiryDate.textContent = formatDisplayDate(expiryDate);
        }

        // Display base and adjusted life expectancy
        if (DOM.baseLifeExp) {
            DOM.baseLifeExp.textContent = result.baseLifeExpectancy.toFixed(1);
        }
        if (DOM.adjLifeExp) {
            DOM.adjLifeExp.textContent = result.adjustedLifeExpectancy.toFixed(1);
        }

        // Display data source info (year used, data origin)
        var dataSourceEl = document.getElementById('data-source-info');
        if (dataSourceEl && result.dataYear && result.dataSource) {
            dataSourceEl.textContent = 'Based on ' + result.dataYear + ' life expectancy data (' + result.dataSource + ')';
        }

        // ---- Populate the breakdown table ----
        DOM.breakdownBody.innerHTML = '';
        if (result.modifiers && result.modifiers.length > 0) {
            for (var i = 0; i < result.modifiers.length; i++) {
                var mod = result.modifiers[i];
                var row = document.createElement('tr');

                // Determine CSS class based on whether the modifier is positive or negative
                var cssClass = 'neutral';
                if (mod.years > 0) {
                    cssClass = 'positive';
                } else if (mod.years < 0) {
                    cssClass = 'negative';
                }

                row.className = cssClass;
                row.innerHTML =
                    '<td data-label="Factor">' + escapeHtml(mod.factor) + '</td>' +
                    '<td data-label="Impact">' + escapeHtml(mod.description) + '</td>' +
                    '<td data-label="Years">' + (mod.years > 0 ? '+' : '') + mod.years.toFixed(1) + ' yrs</td>';

                DOM.breakdownBody.appendChild(row);
            }
        }

        // ---- Update progress bar ----
        updateProgressBar();

        // ---- Start countdown ----
        startCountdown();

        // ---- Show a new quote and start rotation (every 15 seconds) ----
        showRandomQuote();
        startQuoteRotation();

        // Move keyboard, screen-reader, and mobile users directly to the result.
        scrollToResults();
    }

    function editDetails() {
        DOM.resultsSection.classList.add('hidden');
        DOM.resultsSection.classList.remove('visible');
        DOM.resultsSection.classList.remove('fade-in');
        DOM.formSection.classList.remove('hidden');

        requestAnimationFrame(function() {
            DOM.birthDate.focus();
            DOM.formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    function scrollToResults() {
        if (!DOM.resultsSection) return;

        // Wait until display/opacity classes and result text have been painted.
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                try {
                    DOM.resultsSection.focus({ preventScroll: true });
                } catch (e) {
                    DOM.resultsSection.focus();
                }

                var reducedMotion = window.matchMedia &&
                    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

                DOM.resultsSection.scrollIntoView({
                    behavior: reducedMotion ? 'auto' : 'smooth',
                    block: 'start'
                });
            });
        });
    }

    // =========================================================================
    // Countdown timer — updates every second
    // =========================================================================
    function startCountdown() {
        if (countdownInterval) {
            clearTimeout(countdownInterval);
        }
        updateCountdown(false);
        scheduleCountdownTick();
    }

    function scheduleCountdownTick() {
        var delay = 1000 - (Date.now() % 1000) + 20;
        countdownInterval = setTimeout(function() {
            updateCountdown(true);
            scheduleCountdownTick();
        }, delay);
    }

    // =========================================================================
    // updateCountdown — the core tick function
    // =========================================================================
    function updateCountdown(animateTick) {
        var now = new Date();
        var diff = expiryDate - now;

        if (diff <= 0) {
            // Time has elapsed
            updateCountdownUnit(DOM.cdYears, '00', animateTick);
            updateCountdownUnit(DOM.cdMonths, '00', animateTick);
            updateCountdownUnit(DOM.countdownDays, '00', animateTick);
            updateCountdownUnit(DOM.cdHours, '00', animateTick);
            updateCountdownUnit(DOM.cdMinutes, '00', animateTick);
            updateCountdownUnit(DOM.cdSeconds, '00', animateTick);
            DOM.timeLived.textContent = formatReadableDuration(birthDateObj, expiryDate);

            // Mark progress as 100%
            DOM.progressBarFill.style.height = '100%';
            DOM.progressBarFill.setAttribute('data-percent', '100');
            DOM.progressPercent.textContent = '100%';
            if (DOM.progressBar) DOM.progressBar.setAttribute('aria-valuenow', '100');
            if (fluidSimulation) fluidSimulation.setLevel(100);

            return;
        }

        var remaining = getCalendarDuration(now, expiryDate);

        var changedCards = [
            updateCountdownUnit(DOM.cdYears, padZero(remaining.years), animateTick),
            updateCountdownUnit(DOM.cdMonths, padZero(remaining.months), animateTick),
            updateCountdownUnit(DOM.countdownDays, padZero(remaining.days), animateTick),
            updateCountdownUnit(DOM.cdHours, padZero(remaining.hours), animateTick),
            updateCountdownUnit(DOM.cdMinutes, padZero(remaining.minutes), animateTick),
            updateCountdownUnit(DOM.cdSeconds, padZero(remaining.seconds), animateTick)
        ].filter(Boolean);
        if (animateTick) triggerCountdownTick(changedCards);

        if (birthDateObj) {
            DOM.timeLived.textContent = formatReadableDuration(birthDateObj, now);
        }

        // Update progress bar
        updateProgressBar();
    }

    function updateCountdownUnit(element, value, animate) {
        if (!element || element.textContent === value) return null;

        var previousValue = element.textContent;
        element.setAttribute('data-previous', previousValue);
        element.setAttribute('aria-label', value);
        element.textContent = value;
        if (!animate || !element.parentElement) return null;

        var card = element.parentElement;
        card.classList.remove('is-flipping');
        void card.offsetWidth;
        card.classList.add('is-flipping');
        return card;
    }

    // =========================================================================
    // triggerCountdownTick — adds a brief visual pulse every second tick
    // =========================================================================
    function triggerCountdownTick(changedCards) {
        if (fluidSimulation) fluidSimulation.addDrop();

        if (countdownTickTimeout) {
            clearTimeout(countdownTickTimeout);
        }
        countdownTickTimeout = setTimeout(function() {
            for (var i = 0; i < changedCards.length; i++) {
                changedCards[i].classList.remove('is-flipping');
            }
        }, 480);
    }

    // =========================================================================
    // updateProgressBar — adjusts fill width, percentage text, and color band
    // =========================================================================
    function updateProgressBar() {
        if (!birthDateObj || !expiryDate) return;

        var totalLifeMs   = expiryDate - birthDateObj;
        var livedMs       = new Date() - birthDateObj;
        var pct = 0;

        if (totalLifeMs > 0) {
            pct = Math.min(100, Math.max(0, (livedMs / totalLifeMs) * 100));
        }

        DOM.progressBarFill.style.height = pct.toFixed(2) + '%';
        DOM.progressPercent.textContent = pct.toFixed(1) + '%';
        if (DOM.progressBar) DOM.progressBar.setAttribute('aria-valuenow', pct.toFixed(1));
        if (fluidSimulation) fluidSimulation.setLevel(pct);

        // Color band based on percentage:
        //   < 50%   →  green  (data-percent < 50)
        //   50-80%  →  yellow (data-percent between 50 and 80)
        //   >= 80%  →  red    (data-percent >= 80)
        var pctInt = Math.floor(pct);
        DOM.progressBarFill.setAttribute('data-percent', pctInt);
    }

    // =========================================================================
    // createFluidSimulation — blood drains from the upper hourglass reservoir
    // into the elapsed-life chamber below. Each clock tick supplies one drop.
    // =========================================================================
    function createFluidSimulation(canvas) {
        if (!canvas || !canvas.getContext) return null;

        var ctx = canvas.getContext('2d');
        var width = canvas.width;
        var height = canvas.height;
        var centerX = width / 2;
        var topInnerY = 24;
        var neckTopY = 117;
        var neckBottomY = 132;
        var bottomInnerY = 226;
        var pointCount = 19;
        var surface = [];
        var targetY = bottomInnerY + 4;
        var levelY = bottomInnerY + 4;
        var levelVelocity = 0;
        var lastTime = 0;
        var drop = null;
        var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        for (var i = 0; i < pointCount; i++) {
            surface.push({ y: 0, velocity: 0 });
        }

        function hourglassPath() {
            ctx.beginPath();
            ctx.moveTo(20, 20);
            ctx.lineTo(width - 20, 20);
            ctx.bezierCurveTo(width - 20, 60, centerX + 13, 99, centerX + 7, neckTopY);
            ctx.quadraticCurveTo(centerX + 5, 123, centerX + 7, neckBottomY);
            ctx.bezierCurveTo(centerX + 13, 151, width - 20, 189, width - 20, height - 20);
            ctx.lineTo(20, height - 20);
            ctx.bezierCurveTo(20, 189, centerX - 13, 151, centerX - 7, neckBottomY);
            ctx.quadraticCurveTo(centerX - 5, 123, centerX - 7, neckTopY);
            ctx.bezierCurveTo(centerX - 13, 99, 20, 60, 20, 20);
            ctx.closePath();
        }

        function createBloodGradient(startY, endY) {
            var gradient = ctx.createLinearGradient(0, startY, width, startY);
            gradient.addColorStop(0, '#100000');
            gradient.addColorStop(0.14, '#360002');
            gradient.addColorStop(0.38, '#710407');
            gradient.addColorStop(0.54, '#9f0c0f');
            gradient.addColorStop(0.68, '#610204');
            gradient.addColorStop(0.9, '#270001');
            gradient.addColorStop(1, '#0c0000');
            return gradient;
        }

        function roundedRectPath(x, y, rectWidth, rectHeight, radius) {
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + rectWidth - radius, y);
            ctx.quadraticCurveTo(x + rectWidth, y, x + rectWidth, y + radius);
            ctx.lineTo(x + rectWidth, y + rectHeight - radius);
            ctx.quadraticCurveTo(x + rectWidth, y + rectHeight, x + rectWidth - radius, y + rectHeight);
            ctx.lineTo(x + radius, y + rectHeight);
            ctx.quadraticCurveTo(x, y + rectHeight, x, y + rectHeight - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
        }

        function drawBloodDepth(startY, endY) {
            if (endY - startY < 2) return;

            var depthGradient = ctx.createLinearGradient(0, startY, 0, endY);
            depthGradient.addColorStop(0, 'rgba(255, 92, 84, 0.17)');
            depthGradient.addColorStop(0.12, 'rgba(121, 0, 4, 0)');
            depthGradient.addColorStop(0.72, 'rgba(26, 0, 1, 0.08)');
            depthGradient.addColorStop(1, 'rgba(5, 0, 0, 0.52)');
            ctx.fillStyle = depthGradient;
            ctx.fillRect(0, startY, width, endY - startY);

            var sheen = ctx.createRadialGradient(centerX - 13, (startY + endY) / 2, 1, centerX - 10, (startY + endY) / 2, width * 0.42);
            sheen.addColorStop(0, 'rgba(255, 108, 98, 0.18)');
            sheen.addColorStop(0.22, 'rgba(195, 24, 24, 0.08)');
            sheen.addColorStop(0.62, 'rgba(60, 0, 2, 0)');
            sheen.addColorStop(1, 'rgba(0, 0, 0, 0.24)');
            ctx.fillStyle = sheen;
            ctx.fillRect(0, startY, width, endY - startY);

            var texture = [
                [0.31, 0.27, 2.2],
                [0.62, 0.42, 1.5],
                [0.45, 0.68, 2.8],
                [0.73, 0.77, 1.9],
                [0.24, 0.86, 1.3]
            ];
            ctx.fillStyle = 'rgba(8, 0, 0, 0.2)';
            for (var textureIndex = 0; textureIndex < texture.length; textureIndex++) {
                var fleck = texture[textureIndex];
                ctx.beginPath();
                ctx.ellipse(width * fleck[0], startY + ((endY - startY) * fleck[1]), fleck[2] * 1.7, fleck[2], -0.35, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        function drawGlassReflections() {
            var glassGradient = ctx.createLinearGradient(18, 0, width - 18, 0);
            glassGradient.addColorStop(0, 'rgba(214, 225, 224, 0.16)');
            glassGradient.addColorStop(0.08, 'rgba(181, 201, 201, 0.06)');
            glassGradient.addColorStop(0.2, 'rgba(255, 255, 255, 0)');
            glassGradient.addColorStop(0.66, 'rgba(255, 255, 255, 0.015)');
            glassGradient.addColorStop(0.84, 'rgba(182, 199, 199, 0.07)');
            glassGradient.addColorStop(1, 'rgba(77, 91, 92, 0.2)');
            ctx.fillStyle = glassGradient;
            ctx.fillRect(18, 18, width - 36, height - 36);

            ctx.strokeStyle = 'rgba(235, 242, 238, 0.29)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(27, 30);
            ctx.bezierCurveTo(29, 63, centerX - 17, 98, centerX - 10, 115);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(210, 221, 219, 0.1)';
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.moveTo(width - 29, 35);
            ctx.bezierCurveTo(width - 32, 65, centerX + 18, 99, centerX + 11, 114);
            ctx.stroke();
        }

        function drawFrame() {
            ctx.save();

            ctx.strokeStyle = 'rgba(0, 0, 0, 0.72)';
            ctx.lineWidth = 5;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
            ctx.shadowBlur = 9;
            hourglassPath();
            ctx.stroke();
            ctx.shadowBlur = 0;

            ctx.strokeStyle = 'rgba(184, 196, 194, 0.32)';
            ctx.lineWidth = 2.5;
            hourglassPath();
            ctx.stroke();
            ctx.strokeStyle = 'rgba(244, 239, 226, 0.35)';
            ctx.lineWidth = 0.8;
            hourglassPath();
            ctx.stroke();

            var postGradient = ctx.createLinearGradient(8, 0, 18, 0);
            postGradient.addColorStop(0, '#160b08');
            postGradient.addColorStop(0.22, '#4a2c20');
            postGradient.addColorStop(0.48, '#8a6248');
            postGradient.addColorStop(0.66, '#4d2e21');
            postGradient.addColorStop(1, '#130907');

            ctx.fillStyle = postGradient;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
            ctx.shadowBlur = 4;
            roundedRectPath(8, 14, 10, height - 28, 4);
            ctx.fill();

            var rightPostGradient = ctx.createLinearGradient(width - 18, 0, width - 8, 0);
            rightPostGradient.addColorStop(0, '#130907');
            rightPostGradient.addColorStop(0.34, '#4d2e21');
            rightPostGradient.addColorStop(0.56, '#8a6248');
            rightPostGradient.addColorStop(0.78, '#4a2c20');
            rightPostGradient.addColorStop(1, '#160b08');
            ctx.fillStyle = rightPostGradient;
            roundedRectPath(width - 18, 14, 10, height - 28, 4);
            ctx.fill();
            ctx.shadowBlur = 0;

            var baseGradient = ctx.createLinearGradient(0, 0, 0, 21);
            baseGradient.addColorStop(0, '#2a1710');
            baseGradient.addColorStop(0.18, '#91694e');
            baseGradient.addColorStop(0.38, '#63422f');
            baseGradient.addColorStop(0.72, '#321c14');
            baseGradient.addColorStop(1, '#100806');

            ctx.fillStyle = baseGradient;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
            ctx.shadowBlur = 6;
            roundedRectPath(3, 3, width - 6, 20, 4);
            ctx.fill();
            roundedRectPath(3, height - 23, width - 6, 20, 4);
            ctx.fill();
            ctx.shadowBlur = 0;

            ctx.strokeStyle = 'rgba(232, 198, 158, 0.25)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(9, 7.5);
            ctx.lineTo(width - 9, 7.5);
            ctx.moveTo(9, height - 18.5);
            ctx.lineTo(width - 9, height - 18.5);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(0, 0, 0, 0.68)';
            ctx.beginPath();
            ctx.moveTo(8, 20);
            ctx.lineTo(width - 8, 20);
            ctx.moveTo(8, height - 5.5);
            ctx.lineTo(width - 8, height - 5.5);
            ctx.stroke();
            ctx.restore();
        }

        function draw() {
            ctx.clearRect(0, 0, width, height);

            ctx.save();
            hourglassPath();
            var chamberGradient = ctx.createLinearGradient(0, 0, width, 0);
            chamberGradient.addColorStop(0, 'rgba(3, 4, 4, 0.92)');
            chamberGradient.addColorStop(0.18, 'rgba(15, 13, 12, 0.74)');
            chamberGradient.addColorStop(0.54, 'rgba(24, 19, 17, 0.52)');
            chamberGradient.addColorStop(0.82, 'rgba(11, 10, 9, 0.76)');
            chamberGradient.addColorStop(1, 'rgba(2, 3, 3, 0.94)');
            ctx.fillStyle = chamberGradient;
            ctx.fill();
            ctx.clip();

            var elapsedFraction = Math.max(0, Math.min(1,
                (bottomInnerY - levelY) / (bottomInnerY - neckBottomY)));
            var topBloodY = topInnerY + ((neckTopY - topInnerY) * elapsedFraction);

            if (topBloodY < neckTopY) {
                ctx.fillStyle = createBloodGradient(topBloodY, neckTopY);
                ctx.shadowColor = 'rgba(190, 15, 15, 0.35)';
                ctx.shadowBlur = 9;
                ctx.fillRect(0, topBloodY, width, neckTopY - topBloodY + 5);
                ctx.shadowBlur = 0;
                drawBloodDepth(topBloodY, neckTopY + 5);

                var topSurfaceGradient = ctx.createLinearGradient(centerX - 50, 0, centerX + 50, 0);
                topSurfaceGradient.addColorStop(0, 'rgba(62, 0, 2, 0.7)');
                topSurfaceGradient.addColorStop(0.48, 'rgba(255, 124, 111, 0.46)');
                topSurfaceGradient.addColorStop(1, 'rgba(48, 0, 1, 0.72)');
                ctx.fillStyle = topSurfaceGradient;
                ctx.beginPath();
                ctx.ellipse(centerX, topBloodY + 0.6, width * 0.44, 3.2, 0, 0, Math.PI * 2);
                ctx.fill();
            }

            var step = width / (pointCount - 1);
            if (levelY <= bottomInnerY + 2) {
                ctx.beginPath();
                ctx.moveTo(0, levelY + surface[0].y);
                for (var i = 1; i < pointCount; i++) {
                    var previousX = (i - 1) * step;
                    var x = i * step;
                    var previousY = levelY + surface[i - 1].y;
                    var y = levelY + surface[i].y;
                    ctx.quadraticCurveTo(previousX, previousY, (previousX + x) / 2, (previousY + y) / 2);
                }
                ctx.lineTo(width, levelY + surface[pointCount - 1].y);
                ctx.lineTo(width, height);
                ctx.lineTo(0, height);
                ctx.closePath();

                ctx.fillStyle = createBloodGradient(levelY, bottomInnerY);
                ctx.shadowColor = 'rgba(190, 15, 15, 0.45)';
                ctx.shadowBlur = 12;
                ctx.fill();
                ctx.shadowBlur = 0;
                drawBloodDepth(levelY, bottomInnerY + 8);

                ctx.beginPath();
                ctx.moveTo(0, levelY + surface[0].y);
                for (var j = 1; j < pointCount; j++) {
                    ctx.lineTo(j * step, levelY + surface[j].y);
                }
                ctx.strokeStyle = 'rgba(255, 132, 119, 0.46)';
                ctx.lineWidth = 1.15;
                ctx.stroke();
            }

            if (drop) {
                var dropGlow = ctx.createRadialGradient(drop.x - 1, drop.y - 1, 0, drop.x, drop.y, 7);
                dropGlow.addColorStop(0, '#ff655b');
                dropGlow.addColorStop(0.35, '#a70b0b');
                dropGlow.addColorStop(1, 'rgba(72, 0, 0, 0)');
                ctx.fillStyle = dropGlow;
                ctx.beginPath();
                ctx.ellipse(drop.x, drop.y, 5, 7, 0, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = 'rgba(255, 210, 197, 0.46)';
                ctx.beginPath();
                ctx.ellipse(drop.x - 1.5, drop.y - 2, 1, 1.8, -0.25, 0, Math.PI * 2);
                ctx.fill();
            }
            drawGlassReflections();
            ctx.restore();
            drawFrame();
        }

        function animate(time) {
            var delta = lastTime ? Math.min(2, (time - lastTime) / 16.667) : 1;
            lastTime = time;

            if (reducedMotion) {
                levelY = targetY;
                draw();
                requestAnimationFrame(animate);
                return;
            }

            // Spring the whole volume toward its requested level.
            levelVelocity += (targetY - levelY) * 0.018 * delta;
            levelVelocity *= Math.pow(0.91, delta);
            levelY += levelVelocity * delta;

            // Each surface point is a damped spring; coupling carries waves.
            for (var i = 0; i < pointCount; i++) {
                surface[i].velocity += -surface[i].y * 0.045 * delta;
                surface[i].velocity *= Math.pow(0.965, delta);
            }

            for (var pass = 0; pass < 2; pass++) {
                for (var p = 0; p < pointCount; p++) {
                    if (p > 0) surface[p].velocity += (surface[p - 1].y - surface[p].y) * 0.055 * delta;
                    if (p < pointCount - 1) surface[p].velocity += (surface[p + 1].y - surface[p].y) * 0.055 * delta;
                }
            }

            for (var k = 0; k < pointCount; k++) {
                surface[k].y += surface[k].velocity * delta;
            }

            if (drop) {
                drop.velocity += 0.42 * delta;
                drop.y += drop.velocity * delta;
                var impactY = Math.max(neckBottomY + 3, Math.min(bottomInnerY, levelY));
                if (drop.y >= impactY) {
                    var impactIndex = Math.floor(pointCount / 2);
                    surface[impactIndex].velocity += 4.2;
                    surface[impactIndex - 1].velocity += 1.7;
                    surface[impactIndex + 1].velocity += 1.7;
                    levelVelocity += 0.12;
                    drop = null;
                }
            }

            draw();
            requestAnimationFrame(animate);
        }

        requestAnimationFrame(animate);

        return {
            addDrop: function() {
                if (targetY > bottomInnerY + 3 || reducedMotion) return;

                drop = {
                    x: centerX,
                    y: neckBottomY,
                    velocity: 0.8
                };
            },
            setLevel: function(percent) {
                var nextLevel = Math.max(0, Math.min(100, Number(percent) || 0));
                targetY = bottomInnerY - ((bottomInnerY - neckBottomY) * nextLevel / 100);
            },
            reset: function() {
                targetY = bottomInnerY + 4;
                levelY = bottomInnerY + 4;
                levelVelocity = 0;
                drop = null;
                for (var i = 0; i < pointCount; i++) {
                    surface[i].y = 0;
                    surface[i].velocity = 0;
                }
                draw();
            }
        };
    }

    // =========================================================================
    // Calendar-aware duration helpers keep years and months meaningful.
    // =========================================================================
    function addCalendarMonths(date, months) {
        var result = new Date(date);
        var originalDay = result.getDate();
        result.setDate(1);
        result.setMonth(result.getMonth() + months);
        var lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
        result.setDate(Math.min(originalDay, lastDay));
        return result;
    }

    function addCalendarDays(date, days) {
        var result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }

    function getCalendarDuration(startDate, endDate) {
        var start = new Date(startDate);
        var end = new Date(endDate);
        if (end <= start) {
            return { years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
        }

        var totalMonths = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
        var cursor = addCalendarMonths(start, totalMonths);
        if (cursor > end) {
            totalMonths--;
            cursor = addCalendarMonths(start, totalMonths);
        }

        var years = Math.floor(totalMonths / 12);
        var months = totalMonths % 12;
        var days = Math.max(0, Math.floor((end - cursor) / 86400000));
        var dayCursor = addCalendarDays(cursor, days);

        while (dayCursor > end && days > 0) {
            days--;
            dayCursor = addCalendarDays(cursor, days);
        }
        while (addCalendarDays(dayCursor, 1) <= end) {
            days++;
            dayCursor = addCalendarDays(cursor, days);
        }

        var remainder = Math.max(0, end - dayCursor);
        var hours = Math.floor(remainder / 3600000);
        remainder -= hours * 3600000;
        var minutes = Math.floor(remainder / 60000);
        remainder -= minutes * 60000;
        var seconds = Math.floor(remainder / 1000);

        return {
            years: years,
            months: months,
            days: days,
            hours: hours,
            minutes: minutes,
            seconds: seconds
        };
    }

    function formatReadableDuration(startDate, endDate) {
        var duration = getCalendarDuration(startDate, endDate);
        return duration.years + ' ' + pluralize('year', duration.years) + ', ' +
            duration.months + ' ' + pluralize('month', duration.months) + ', ' +
            duration.days + ' ' + pluralize('day', duration.days) + '  |  ' +
            padZero(duration.hours) + ':' + padZero(duration.minutes) + ':' + padZero(duration.seconds);
    }

    function pluralize(word, count) {
        return count === 1 ? word : word + 's';
    }

    // =========================================================================
    // Helper: showRandomQuote — picks a random quote and fades it in
    // =========================================================================
    function showRandomQuote() {
        var quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
        // Fade out first if already visible
        if (DOM.quoteDisplay) {
            DOM.quoteDisplay.style.opacity = '0';
            setTimeout(function() {
                DOM.quoteDisplay.innerHTML =
                    '<span class="quote-text">' + escapeHtml(quote.text) + '</span>' +
                    '<span class="quote-author">— ' + escapeHtml(quote.author) + '</span>';
                DOM.quoteDisplay.style.opacity = '1';
            }, 300);
        }
    }

    // =========================================================================
    // startQuoteRotation — changes the quote every 15 seconds
    // =========================================================================
    function startQuoteRotation() {
        if (quoteInterval) {
            clearInterval(quoteInterval);
        }
        quoteInterval = setInterval(showRandomQuote, 15000);
    }

    // =========================================================================
    // clearAllData — resets the app to its initial state
    // =========================================================================
    function clearAllData() {
        // Stop intervals
        if (countdownInterval) {
            clearTimeout(countdownInterval);
            countdownInterval = null;
        }
        if (countdownTickTimeout) {
            clearTimeout(countdownTickTimeout);
            countdownTickTimeout = null;
        }
        if (quoteInterval) {
            clearInterval(quoteInterval);
            quoteInterval = null;
        }

        // Wipe in-memory data
        userData = null;
        expiryDate = null;
        birthDateObj = null;

        // Reset the form
        if (DOM.form) {
            DOM.form.reset();
            updateRegionDropdown();
        }
        if (DOM.formSection) {
            DOM.formSection.classList.remove('hidden');
        }

        // Hide results section
        if (DOM.resultsSection) {
            DOM.resultsSection.classList.add('hidden');
            DOM.resultsSection.classList.remove('visible');
            DOM.resultsSection.classList.remove('fade-in');
        }

        // Clear error message
        hideError();

        // Reset countdown display to zeros
        DOM.cdYears.textContent = '00';
        DOM.cdMonths.textContent = '00';
        DOM.countdownDays.textContent = '00';
        DOM.cdHours.textContent = '00';
        DOM.cdMinutes.textContent = '00';
        DOM.cdSeconds.textContent = '00';

        // Reset progress bar
        if (DOM.progressBarFill) {
            DOM.progressBarFill.style.height = '0%';
            DOM.progressBarFill.setAttribute('data-percent', '0');
        }
        if (DOM.progressBar) DOM.progressBar.setAttribute('aria-valuenow', '0');
        if (fluidSimulation) fluidSimulation.reset();
        if (DOM.progressPercent) {
            DOM.progressPercent.textContent = '0%';
        }
        if (DOM.timeLived) {
            DOM.timeLived.textContent = '';
        }
        if (DOM.expiryDate) {
            DOM.expiryDate.textContent = '--';
        }

        // Clear breakdown table
        if (DOM.breakdownBody) {
            DOM.breakdownBody.innerHTML = '';
        }

        // Show an initial quote again
        showRandomQuote();

        // Terminate and recreate the worker (optional cleanup)
        initWorker();

        requestAnimationFrame(function() {
            DOM.birthDate.focus();
        });
    }

    // =========================================================================
    // showError(message) — displays an error toast
    // =========================================================================
    function showError(message) {
        if (!DOM.errorMessage) return;
        DOM.errorMessage.textContent = message;
        DOM.errorMessage.classList.remove('hidden');
        DOM.errorMessage.classList.add('fade-in');

        // Auto-hide after 5 seconds
        setTimeout(hideError, 5000);
    }

    // Hide the error message
    function hideError() {
        if (DOM.errorMessage) {
            DOM.errorMessage.classList.add('hidden');
            DOM.errorMessage.classList.remove('fade-in');
        }
    }

    // =========================================================================
    // Utility helpers
    // =========================================================================

    // Pad a number to 2 digits
    function padZero(n) {
        return n < 10 ? '0' + n : '' + n;
    }

    // Escape HTML to prevent XSS when rendering user content / quotes
    function escapeHtml(str) {
        if (typeof str !== 'string') return str;
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    function formatDisplayDate(dateObj) {
        return dateObj.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    // =========================================================================
    // Boot the app when the DOM is ready
    // =========================================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOM already ready (e.g., script at end of body)
        init();
    }

})();
