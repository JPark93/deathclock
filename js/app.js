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
        DOM.form              = document.getElementById('death-form');
        DOM.birthDate         = document.getElementById('birth-date');
        DOM.sex               = document.getElementById('sex');
        DOM.country           = document.getElementById('country');
        DOM.smoker            = document.getElementById('smoker');
        DOM.exercise          = document.getElementById('exercise');
        DOM.alcohol           = document.getElementById('alcohol');
        DOM.bmi               = document.getElementById('bmi');
        DOM.resultsSection    = document.getElementById('results-section');
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
        DOM.breakdownBody     = document.getElementById('breakdown-body');
        DOM.quoteDisplay      = document.getElementById('quote-display');
        DOM.errorMessage      = document.getElementById('error-message');
        DOM.clearButton       = document.getElementById('clear-btn');
        DOM.audioToggle       = document.getElementById('audio-toggle');
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
        DOM.clearButton.addEventListener('click', clearAllData);
        DOM.audioToggle.addEventListener('click', handleAudioToggle);

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
        }
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

        birthDateObj = parsedBirthDate;

        userData = {
            birthDate: birthDateValue,
            sex: sexValue,
            country: countryObj,   // full object including years array
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
            DOM.baseLifeExp.textContent = result.baseLifeExpectancy.toFixed(1) + ' years';
        }
        if (DOM.adjLifeExp) {
            DOM.adjLifeExp.textContent = result.adjustedLifeExpectancy.toFixed(1) + ' years';
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
                    '<td>' + escapeHtml(mod.factor) + '</td>' +
                    '<td>' + escapeHtml(mod.description) + '</td>' +
                    '<td>' + (mod.years > 0 ? '+' : '') + mod.years.toFixed(1) + ' yrs</td>';

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
            clearInterval(countdownInterval);
        }
        updateCountdown();    // call immediately so we don't wait 1 second
        countdownInterval = setInterval(updateCountdown, 1000);
    }

    // =========================================================================
    // updateCountdown — the core tick function
    // =========================================================================
    function updateCountdown() {
        var now = new Date();
        var diff = expiryDate - now;

        if (diff <= 0) {
            // Time has elapsed
            DOM.countdownDays.textContent = '0';
            DOM.cdHours.textContent = '00';
            DOM.cdMinutes.textContent = '00';
            DOM.cdSeconds.textContent = '00';
            if (DOM.countdownTime) {
                DOM.countdownTime.classList.remove('tick');
            }
            DOM.timeLived.textContent = formatCompactDuration(birthDateObj, expiryDate);

            // Mark progress as 100%
            DOM.progressBarFill.style.height = '100%';
            DOM.progressBarFill.setAttribute('data-percent', '100');
            DOM.progressPercent.textContent = '100%';
            if (DOM.progressBar) DOM.progressBar.setAttribute('aria-valuenow', '100');
            if (fluidSimulation) fluidSimulation.setLevel(100);

            return;
        }

        // Calculate days, hours, minutes, seconds from the remaining ms
        var days    = Math.floor(diff / (1000 * 60 * 60 * 24));
        var hours   = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        var seconds = Math.floor((diff % (1000 * 60)) / 1000);

        DOM.countdownDays.textContent = days;
        DOM.cdHours.textContent   = padZero(hours);
        DOM.cdMinutes.textContent = padZero(minutes);
        DOM.cdSeconds.textContent = padZero(seconds);
        triggerCountdownTick();

        // Time lived in compact format
        if (birthDateObj) {
            DOM.timeLived.textContent = formatCompactDuration(birthDateObj, now);
        }

        // Update progress bar
        updateProgressBar();
    }

    // =========================================================================
    // triggerCountdownTick — adds a brief visual pulse every second tick
    // =========================================================================
    function triggerCountdownTick() {
        if (!DOM.countdownTime) return;

        DOM.countdownTime.classList.remove('tick');
        // Force reflow so the class re-add always retriggers animation
        void DOM.countdownTime.offsetWidth;
        DOM.countdownTime.classList.add('tick');

        if (countdownTickTimeout) {
            clearTimeout(countdownTickTimeout);
        }
        countdownTickTimeout = setTimeout(function() {
            if (DOM.countdownTime) {
                DOM.countdownTime.classList.remove('tick');
            }
        }, 180);
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
    // createFluidSimulation — a small spring surface for the life-progress vial.
    // The body rises from below the vial, while neighboring surface points pass
    // energy between them to create a damped slosh rather than a looping sprite.
    // =========================================================================
    function createFluidSimulation(canvas) {
        if (!canvas || !canvas.getContext) return null;

        var ctx = canvas.getContext('2d');
        var width = canvas.width;
        var height = canvas.height;
        var pointCount = 19;
        var surface = [];
        var targetY = height + 8;
        var levelY = height + 8;
        var levelVelocity = 0;
        var lastLevel = 0;
        var lastTime = 0;
        var sloshClock = 0;
        var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        for (var i = 0; i < pointCount; i++) {
            surface.push({ y: 0, velocity: 0 });
        }

        function vialPath() {
            ctx.beginPath();
            ctx.moveTo(3, 2);
            ctx.lineTo(width - 3, 2);
            ctx.lineTo(width - 3, height - 27);
            ctx.quadraticCurveTo(width - 3, height - 3, width - 27, height - 3);
            ctx.lineTo(27, height - 3);
            ctx.quadraticCurveTo(3, height - 3, 3, height - 27);
            ctx.closePath();
        }

        function draw() {
            ctx.clearRect(0, 0, width, height);
            if (levelY > height + 5) return;

            ctx.save();
            vialPath();
            ctx.clip();

            var step = width / (pointCount - 1);
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

            var liquid = ctx.createLinearGradient(0, levelY, width, height);
            liquid.addColorStop(0, '#310000');
            liquid.addColorStop(0.48, '#870707');
            liquid.addColorStop(0.78, '#5b0000');
            liquid.addColorStop(1, '#230000');
            ctx.fillStyle = liquid;
            ctx.shadowColor = 'rgba(190, 15, 15, 0.45)';
            ctx.shadowBlur = 12;
            ctx.fill();
            ctx.shadowBlur = 0;

            // A narrow meniscus highlight follows the simulated surface.
            ctx.beginPath();
            ctx.moveTo(0, levelY + surface[0].y);
            for (var j = 1; j < pointCount; j++) {
                ctx.lineTo(j * step, levelY + surface[j].y);
            }
            ctx.strokeStyle = 'rgba(255, 135, 125, 0.42)';
            ctx.lineWidth = 1.4;
            ctx.stroke();

            var depthShade = ctx.createLinearGradient(0, levelY, 0, height);
            depthShade.addColorStop(0, 'rgba(255, 65, 55, 0.12)');
            depthShade.addColorStop(0.55, 'rgba(35, 0, 0, 0.04)');
            depthShade.addColorStop(1, 'rgba(10, 0, 0, 0.48)');
            ctx.fillStyle = depthShade;
            ctx.fillRect(0, levelY - 4, width, height - levelY + 4);
            ctx.restore();
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
                var horizontalPosition = (i / (pointCount - 1)) - 0.5;
                var gentleTilt =
                    Math.sin(time * 0.00115) * horizontalPosition * 0.3 +
                    Math.sin((time * 0.002) + (i * 0.28)) * 0.08;
                surface[i].velocity += (-surface[i].y * 0.045 + gentleTilt) * delta;
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

            // An occasional small edge impulse keeps the settled liquid alive.
            sloshClock += delta;
            if (sloshClock > 120 && targetY < height - 4) {
                surface[Math.random() < 0.5 ? 1 : pointCount - 2].velocity += (Math.random() - 0.5) * 3;
                sloshClock = 0;
            }

            draw();
            requestAnimationFrame(animate);
        }

        requestAnimationFrame(animate);

        return {
            setLevel: function(percent) {
                var nextLevel = Math.max(0, Math.min(100, Number(percent) || 0));
                targetY = height - 4 - ((height - 8) * nextLevel / 100);

                // Only kick the surface for a meaningful level change, not each timer tick.
                if (Math.abs(nextLevel - lastLevel) > 0.25) {
                    surface[2].velocity -= 2.8;
                    surface[pointCount - 3].velocity += 2.1;
                }
                lastLevel = nextLevel;
            },
            reset: function() {
                targetY = height + 8;
                levelY = height + 8;
                levelVelocity = 0;
                lastLevel = 0;
                for (var i = 0; i < pointCount; i++) {
                    surface[i].y = 0;
                    surface[i].velocity = 0;
                }
                draw();
            }
        };
    }

    // =========================================================================
    // Helper: formatCompactDuration(start, end)
    // Returns a human-readable string like "30y 125d 3h 22m 14s"
    // =========================================================================
    function formatCompactDuration(startDate, endDate) {
        var diff = endDate - startDate;
        if (diff < 0) diff = 0;

        var totalSeconds  = Math.floor(diff / 1000);
        var years   = Math.floor(totalSeconds / (365.25 * 24 * 3600));
        var remain  = totalSeconds - (years * 365.25 * 24 * 3600);
        var days    = Math.floor(remain / (24 * 3600));
        remain = remain - (days * 24 * 3600);
        var hours   = Math.floor(remain / 3600);
        remain = remain - (hours * 3600);
        var minutes = Math.floor(remain / 60);
        var seconds = remain - (minutes * 60);

        var parts = [];
        if (years > 0)   parts.push(years + 'y');
        if (days > 0)    parts.push(days + 'd');
        if (hours > 0)   parts.push(hours + 'h');
        if (minutes > 0) parts.push(minutes + 'm');
        parts.push(seconds + 's');

        return parts.join(' ');
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
                    '"<span class="quote-text">' + escapeHtml(quote.text) + '</span>"' +
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
            clearInterval(countdownInterval);
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
        DOM.countdownDays.textContent = '0';
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
    // handleAudioToggle — toggles ambient audio on/off
    // =========================================================================
    function handleAudioToggle() {
        if (window.DeathClockAudio && window.DeathClockAudio.toggle) {
            window.DeathClockAudio.toggle();
        }
        // Update visual state of the button
        DOM.audioToggle.classList.toggle('active');
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
