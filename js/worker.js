// =============================================================================
// Death Clock Web Worker — PII-Isolated Computation Thread
// =============================================================================
// This worker receives birth date, sex, country (with historical years data),
// and lifestyle data.  It performs a birth-year-aware life-expectancy lookup,
// applies lifestyle modifiers, and returns the result.  All personally identifiable
// information is kept in a scoped variable and explicitly nulled after use.
// =============================================================================

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// World-average life expectancy (fallback when country data is unavailable)
const WORLD_AVERAGE_LIFE_EXPECTANCY = 73;

// Gregorian calendar average days per year for high-precision date math
const GREGORIAN_DAYS_PER_YEAR = 365.2425;

// ---------------------------------------------------------------------------
// Lifestyle Modifier Lookup Table
// ---------------------------------------------------------------------------
// Each modifier is a function that receives the relevant lifestyle value and
// returns an object { years, description }.  A positive value adds to
// life expectancy; a negative value subtracts.

const MODIFIERS = {
    // --- Smoking -----------------------------------------------------------
    smoker: function(value) {
        if (value) {
            return { years: -10, description: '-10 years (smoker)' };
        }
        return { years: 0, description: 'No smoking impact' };
    },

    // --- Exercise ----------------------------------------------------------
    exercise: function(value) {
        var levels = {
            'sedentary': { years:  0, description: 'No exercise benefit (sedentary)' },
            'moderate':  { years: +3, description: '+3 years (moderate exercise)' },
            'active':    { years: +5, description: '+5 years (active exercise)' },
        };
        var result = levels[value] || levels['sedentary'];
        return {
            years: result.years,
            description: result.years === 0 ? result.description : '+' + result.years + ' years (' + value + ' exercise)',
        };
    },

    // --- Alcohol -----------------------------------------------------------
    // Evidence anchors used for these bands:
    // - Wood et al. (Lancet, 2018): higher weekly intake is associated with
    //   shorter life expectancy from age 40, with approximate losses of
    //   ~6 months (around 5-10 drinks/week), ~1-2 years (10-15 drinks/week),
    //   and ~4-5 years for high intakes (>18 drinks/week).
    // - WHO and GBD 2016: risk generally increases with higher consumption and
    //   no drinking is the minimum-risk reference at population level.
    alcohol: function(value) {
        var levels = {
            'none':      { years:  0.0, description: 'Reference: no alcohol (0 drinks/week)' },
            'low':       { years: -0.5, description: '-0.5 years (1-7 drinks/week)' },
            'moderate':  { years: -1.5, description: '-1.5 years (8-14 drinks/week)' },
            'high':      { years: -3.0, description: '-3.0 years (15-20 drinks/week)' },
            'very_high': { years: -4.5, description: '-4.5 years (21+ drinks/week)' },
        };
        var result = levels[value] || levels['none'];
        return {
            years: result.years,
            description: result.description,
        };
    },

    // --- BMI ---------------------------------------------------------------
    bmi: function(value) {
        var levels = {
            'underweight': { years: -2, description: '-2 years (underweight)' },
            'normal':      { years:  0, description: 'No BMI impact (normal)' },
            'overweight':  { years: -2, description: '-2 years (overweight)' },
            'obese':       { years: -5, description: '-5 years (obese)' },
        };
        var result = levels[value] || levels['normal'];
        return {
            years: result.years,
            description: result.years === 0 ? result.description : result.years + ' years (' + value + ')',
        };
    },
};

// Human-readable labels for the modifier summary list
const MODIFIER_LABELS = {
    smoker:   'Smoker',
    exercise: 'Exercise',
    alcohol:  'Alcohol',
    bmi:      'BMI',
};

// ---------------------------------------------------------------------------
// Helper: Resolve base life expectancy from historical country data
// ---------------------------------------------------------------------------
// countryYears: array of year entries, e.g. [ {year, both} | {year, male, female, both} ]
// birthYear: integer — the user's birth year
// sex: 'male' | 'female' | undefined
// Returns: { value: number, dataYear: number, dataSource: string }
function resolveBaseExpectancy(countryYears, birthYear, sex) {
    if (!countryYears || !countryYears.length || typeof birthYear !== 'number') {
        return {
            value: WORLD_AVERAGE_LIFE_EXPECTANCY,
            dataYear: null,
            dataSource: 'World average fallback',
        };
    }

    // 1. Find the year entry matching birthYear (exact or nearest).
    var target = null;
    for (var i = 0; i < countryYears.length; i++) {
        if (countryYears[i].year === birthYear) {
            target = countryYears[i];
            break;
        }
    }

    // No exact match — find the nearest year by absolute difference.
    if (!target) {
        var bestNeg  = null;   // closest earlier-or-equal entry
        var negDist  = Infinity;
        var bestPos  = null;   // closest later entry
        var posDist  = Infinity;

        for (var i = 0; i < countryYears.length; i++) {
            var diff = countryYears[i].year - birthYear;
            if (diff <= 0) {
                if (-diff > negDist || (negDist === Infinity && bestNeg)) continue;
                if (-diff < negDist || (!bestNeg)) {
                    negDist = -diff;
                    bestNeg = countryYears[i];
                } else if (-diff === negDist && diff < birthYear) {
                    // Same distance, pick earlier year
                    if (countryYears[i].year < bestNeg.year) {
                        bestNeg = countryYears[i];
                    }
                }
            } else {
                if (diff < posDist || !bestPos) {
                    posDist = diff;
                    bestPos = countryYears[i];
                } else if (diff === posDist && countryYears[i].year < bestPos.year) {
                    bestPos = countryYears[i];
                }
            }
        }

        // Pick the closer side; ties go to earlier year.
        if (!bestNeg && !bestPos) {
            return {
                value: WORLD_AVERAGE_LIFE_EXPECTANCY,
                dataYear: null,
                dataSource: 'World average fallback',
            };
        }
        if (bestNeg && bestPos) {
            target = negDist <= posDist ? bestNeg : bestPos;
        } else {
            target = bestNeg || bestPos;
        }
    }

    // 2. Determine the value from this year entry based on sex & available fields.
    var value = null;
    var dataSource = '';

    if (sex === 'male' && typeof target.male === 'number') {
        value = target.male;
        dataSource = 'WHO (sex-specific)';
    } else if (sex === 'female' && typeof target.female === 'number') {
        value = target.female;
        dataSource = 'WHO (sex-specific)';
    } else if (typeof target.both === 'number') {
        if (sex === 'male') {
            value = target.both - 4.5;
            dataSource = 'OWID (combined + sex modifier)';
        } else if (sex === 'female') {
            value = target.both + 4.5;
            dataSource = 'OWID (combined + sex modifier)';
        } else {
            // No sex or non-binary — use combined as-is
            value = target.both;
            dataSource = 'OWID (combined)';
        }
    }

    // Fallback if no usable data in this entry at all
    if (value === null) {
        return {
            value: WORLD_AVERAGE_LIFE_EXPECTANCY,
            dataYear: target ? target.year : null,
            dataSource: 'World average fallback',
        };
    }

    return {
        value: value,
        dataYear: target.year,
        dataSource: dataSource,
    };
}

// ---------------------------------------------------------------------------
// Helper: Add a fractional number of years to a Date
// ---------------------------------------------------------------------------
// Uses 365.2425 days per year (Gregorian average) for precision.
function addYearsToDate(date, years) {
    var millisecondsPerYear = GREGORIAN_DAYS_PER_YEAR * 24 * 60 * 60 * 1000;
    return new Date(date.getTime() + years * millisecondsPerYear);
}

// ---------------------------------------------------------------------------
// Core calculation
// ---------------------------------------------------------------------------
function calculate(data) {
    // Parse birth date — will throw on invalid input
    var birthDate = new Date(data.birthDate);
    if (isNaN(birthDate.getTime())) {
        throw new Error('Invalid birth date: ' + data.birthDate);
    }

    // 1. Prefer optional regional data; otherwise use the country history.
    var region = data.region && data.region.years && data.region.years.length
        ? data.region
        : null;
    var baseResult = resolveBaseExpectancy(
        region ? region.years : data.country.years,
        data.birthYear,       // integer — extracted from birth date in app.js
        data.sex
    );
    if (region) {
        baseResult.dataSource = (region.source || 'Regional life expectancy data') + ' - ' + region.name;
    }
    var baseExpectancy = baseResult.value;

    // 2. Compute modifiers from lifestyle data
    var lifestyle = data.lifestyle || {};
    var modifierResults = [];
    var totalModifier = 0;

    // Process each modifier category in a documented order
    var categories = ['smoker', 'exercise', 'alcohol', 'bmi'];

    for (var i = 0; i < categories.length; i++) {
        var key = categories[i];
        var fn = MODIFIERS[key];
        var value = lifestyle[key];
        var result = fn(value);

        // Build a descriptive label for the summary
        var label = MODIFIER_LABELS[key];
        if (key === 'exercise' && value) {
            label = 'Exercise (' + value.charAt(0).toUpperCase() + value.slice(1) + ')';
        } else if (key === 'alcohol' && value) {
            var alcoholBands = {
                none: 'None (0/wk)',
                low: 'Low (1-7/wk)',
                moderate: 'Moderate (8-14/wk)',
                high: 'High (15-20/wk)',
                very_high: 'Very High (21+/wk)'
            };
            label = 'Alcohol (' + (alcoholBands[value] || value) + ')';
        } else if (key === 'bmi' && value) {
            label = 'BMI (' + value.charAt(0).toUpperCase() + value.slice(1) + ')';
        } else if (key === 'smoker') {
            label = value ? 'Smoker (Yes)' : 'Smoker (No)';
        }

        modifierResults.push({
            factor: label,
            years: result.years,
            description: result.description,
        });
        totalModifier += result.years;
    }

    // 3. Adjusted life expectancy
    var adjustedExpectancy = baseExpectancy + totalModifier;

    // 4. Calculate expected expiry date
    var expiryDate = addYearsToDate(birthDate, adjustedExpectancy);

    return {
        expiryDate: expiryDate.toISOString(),
        baseLifeExpectancy: baseExpectancy,
        adjustedLifeExpectancy: adjustedExpectancy,
        modifiers: modifierResults,
        dataYear: baseResult.dataYear,
        dataSource: baseResult.dataSource,
    };
}

// ---------------------------------------------------------------------------
// Message handler — Web Worker entry point
// ---------------------------------------------------------------------------
self.onmessage = function(e) {
    // Privacy: keep all input in a scoped variable
    var sessionData = e.data;

    try {
        if (sessionData.action === 'calculate') {
            // Ensure birthYear is passed through to the calculation
            if (typeof sessionData.data.birthYear !== 'number') {
                // Derive from birthDate as safety net
                var bd = new Date(sessionData.data.birthDate);
                sessionData.data.birthYear = bd.getFullYear();
            }

            var result = calculate(sessionData.data);
            postMessage({
                action: 'result',
                result: result,
            });
        } else {
            postMessage({
                action: 'error',
                error: 'Unknown action: ' + sessionData.action,
            });
        }
    } catch (err) {
        // Send error back to main thread — never log PII
        postMessage({
            action: 'error',
            error: err.message,
        });
    } finally {
        // Privacy: explicitly null out all PII after computation
        sessionData = null;
    }
};
