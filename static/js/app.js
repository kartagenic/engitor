/* ═══════════════════════════════════════════════════════════
   WellMech — Frontend Application
   ═══════════════════════════════════════════════════════════ */

// ════════════════════════════════════════════════════════════
// ЕДИНИЦЫ ИЗМЕРЕНИЯ — SI / FIELD
// ════════════════════════════════════════════════════════════

const UNITS = {
    si:    { depth:'м',   weight:'кг',  linwt:'кг/м',   force:'кН',   od:'мм',  dens:'г/см³' },
    field: { depth:'ft',  weight:'lb',  linwt:'lb/ft',  force:'klbf', od:'in',  dens:'ppg'  },
};

// Conversion factors: multiply to go FROM field TO SI
const FIELD_TO_SI = {
    depth:  0.3048,    // ft -> m
    weight: 0.453592,  // lb -> kg
    linwt:  1.48816,   // lb/ft -> kg/m
    force:  4.44822,   // klbf -> kN
    od:     25.4,      // in -> mm
    dens:   0.11983,   // ppg -> g/cm³
};

let unitSystem = localStorage.getItem('wm-units') || 'si';

function toSI(val, type) {
    if (unitSystem === 'si') return val;
    return val * FIELD_TO_SI[type];
}

function fromSI(val, type) {
    if (unitSystem === 'si') return val;
    return val / FIELD_TO_SI[type];
}

function toggleUnits() {
    unitSystem = unitSystem === 'si' ? 'field' : 'si';
    localStorage.setItem('wm-units', unitSystem);
    applyUnitLabels();
    convertInputValues();
    updateAssemblySummary();
    // Update toggle thumb visual
    const thumb = document.getElementById('units-toggle-thumb');
    if (thumb) thumb.style.transform = unitSystem === 'field' ? 'translateX(20px)' : '';
}

function applyUnitLabels() {
    // Update label spans
    document.querySelectorAll('.unit-lbl[data-unit]').forEach(el => {
        const type = el.getAttribute('data-unit');
        if (UNITS[unitSystem][type]) el.textContent = UNITS[unitSystem][type];
    });
    // Update toggle button label
    const lbl = document.getElementById('units-toggle-label');
    if (lbl) lbl.textContent = unitSystem === 'field' ? 'SI единицы' : 'Field Units';
    // Stat card units
    const totalLengthEl = document.getElementById('total-length');
    if (totalLengthEl) {
        // will be re-rendered by updateAssemblySummary
    }
}

function convertInputValues() {
    // Convert all inputs with data-unit-type attribute
    document.querySelectorAll('input[data-unit-type]').forEach(inp => {
        const type = inp.getAttribute('data-unit-type');
        const val = parseFloat(inp.value);
        if (!isNaN(val) && val !== 0) {
            if (unitSystem === 'field') {
                // switching TO field: convert from SI to field
                inp.value = (val / FIELD_TO_SI[type]).toFixed(4).replace(/\.?0+$/, '');
            } else {
                // switching TO SI: convert from field to SI
                inp.value = (val * FIELD_TO_SI[type]).toFixed(4).replace(/\.?0+$/, '');
            }
        }
    });
    // Also convert assembly table inputs (each row)
    const asmRows = document.getElementById('assembly-tbody').rows;
    for (const row of asmRows) {
        const inputs = row.querySelectorAll('input[type="number"]');
        // number inputs only: [0]=len(depth), [1]=weight, [2]=od, [3]=wtPerUnit(linwt), [4]=maxLoad(force)
        const types = ['depth', 'weight', 'od', 'linwt', 'force'];
        inputs.forEach((inp, i) => {
            const type = types[i];
            if (!type) return;
            const val = parseFloat(inp.value);
            if (!isNaN(val) && val !== 0) {
                if (unitSystem === 'field') {
                    inp.value = (val / FIELD_TO_SI[type]).toFixed(4).replace(/\.?0+$/, '');
                } else {
                    inp.value = (val * FIELD_TO_SI[type]).toFixed(4).replace(/\.?0+$/, '');
                }
            }
        });
    }
    // Convert survey depth column
    const surveyRows = document.getElementById('survey-tbody').rows;
    for (const row of surveyRows) {
        const inp = row.querySelectorAll('input')[0];
        if (!inp) continue;
        const val = parseFloat(inp.value);
        if (!isNaN(val) && val !== 0) {
            if (unitSystem === 'field') {
                inp.value = (val / FIELD_TO_SI['depth']).toFixed(2).replace(/\.?0+$/, '');
            } else {
                inp.value = (val * FIELD_TO_SI['depth']).toFixed(2).replace(/\.?0+$/, '');
            }
        }
    }
    // Convert mu-tbody depth inputs
    const muRows = document.getElementById('mu-tbody').rows;
    for (const row of muRows) {
        const ins = row.querySelectorAll('input');
        [0, 1].forEach(i => {
            if (!ins[i]) return;
            const val = parseFloat(ins[i].value);
            if (!isNaN(val) && val !== 0) {
                if (unitSystem === 'field') {
                    ins[i].value = (val / FIELD_TO_SI['depth']).toFixed(2).replace(/\.?0+$/, '');
                } else {
                    ins[i].value = (val * FIELD_TO_SI['depth']).toFixed(2).replace(/\.?0+$/, '');
                }
            }
        });
    }
}

// Init unit system on load
(function initUnits() {
    applyUnitLabels();
    const thumb = document.getElementById('units-toggle-thumb');
    if (thumb) thumb.style.transform = unitSystem === 'field' ? 'translateX(20px)' : '';
})();

// ── Состояние приложения ──
const state = {
    survey: [],
    assembly: [],
    trajectory: null,
    calibratedMu: null,
    results: { reachability: null, hookload: null, packer: null, torqueDrag: null },
};

// ════════════════════════════════════════════════════════════
// ТЕМА — СВЕТЛАЯ / ТЁМНАЯ
// ════════════════════════════════════════════════════════════

(function initTheme() {
    const saved = localStorage.getItem('wm-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeLabel(saved);
})();

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next    = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('wm-theme', next);
    updateThemeLabel(next);
    // Перерисовать открытые графики
    redrawAllCharts();
}

function updateThemeLabel(theme) {
    const el = document.getElementById('theme-toggle-label');
    if (el) el.textContent = theme === 'dark' ? 'Светлая тема' : 'Тёмная тема';
}

// ── Динамический Plotly layout, зависящий от темы ──
function getPlotlyLayout(overrides = {}) {
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    const bg   = dark ? '#0f101a' : '#ffffff';
    const surf = dark ? '#0a0b12' : '#f4f6fb';
    const grid = dark ? '#1e2035' : '#d5daf0';
    const txt  = dark ? '#8b8fa8' : '#4a506e';

    return {
        paper_bgcolor: bg,
        plot_bgcolor:  surf,
        font: { color: txt, family: 'Inter, system-ui, sans-serif', size: 11 },
        margin: { l: 65, r: 20, t: 36, b: 50 },
        xaxis: { gridcolor: grid, linecolor: grid, zerolinecolor: grid,
                 tickfont: { color: txt }, title: { font: { size: 12 } } },
        yaxis: { gridcolor: grid, linecolor: grid, zerolinecolor: grid,
                 autorange: 'reversed', tickfont: { color: txt },
                 title: { font: { size: 12 } } },
        legend: { bgcolor: dark ? 'rgba(20,21,31,0.85)' : 'rgba(255,255,255,0.9)',
                  bordercolor: grid, font: { color: txt, size: 11 } },
        ...overrides,
    };
}

// ID всех живых графиков для перерисовки при смене темы
const _liveCharts = new Set();
function _plot(divId, traces, layoutOverride = {}, configOverride = {}) {
    const layout = { ...getPlotlyLayout(), ...layoutOverride };
    Plotly.newPlot(divId, traces, layout,
                   { responsive: true, displaylogo: false,
                     modeBarButtonsToRemove: ['lasso2d','select2d'],
                     ...configOverride });
    _liveCharts.add(divId);
}
function redrawAllCharts() {
    // Re-layout colour props for all live charts
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    const bg   = dark ? '#0f101a' : '#ffffff';
    const surf = dark ? '#0a0b12' : '#f4f6fb';
    const grid = dark ? '#1e2035' : '#d5daf0';
    const txt  = dark ? '#8b8fa8' : '#4a506e';
    const legendBg = dark ? 'rgba(20,21,31,0.85)' : 'rgba(255,255,255,0.9)';
    _liveCharts.forEach(id => {
        const el = document.getElementById(id);
        if (!el || !el._fullLayout) return;
        Plotly.relayout(id, {
            paper_bgcolor: bg, plot_bgcolor: surf,
            'font.color': txt,
            'xaxis.gridcolor': grid, 'xaxis.linecolor': grid, 'xaxis.zerolinecolor': grid,
            'yaxis.gridcolor': grid, 'yaxis.linecolor': grid, 'yaxis.zerolinecolor': grid,
            'legend.bgcolor': legendBg, 'legend.bordercolor': grid,
        }).catch(() => {});
    });
}

const plotlyConfig = { responsive: true, displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d'] };


// ════════════════════════════════════════════════════════════
// НАВИГАЦИЯ
// ════════════════════════════════════════════════════════════

function goToTab(tabName) {
    const item = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
    if (item) item.click();
}

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        item.classList.add('active');
        document.getElementById('tab-' + item.dataset.tab).classList.add('active');

        if (item.dataset.tab === 'calculations')  { updatePackerSelect(); syncTdDepth(); }
        if (item.dataset.tab === 'export')         updateStatusChecklist();
        if (item.dataset.tab === 'assembly')       updateAssemblySummary();
        if (item.dataset.tab === 'analytics')      refreshAnalytics();
        if (item.dataset.tab === 'visualization')  onVizTabOpen();
    });
});

function onVizTabOpen() {
    const hasSurvey = getSurveyData().length >= 2;
    document.getElementById('viz-empty-state').style.display = hasSurvey ? 'none' : '';
    document.getElementById('viz-has-data').style.display    = hasSurvey ? ''     : 'none';
    if (hasSurvey && !_vizData) buildTrajectory();
}


// ════════════════════════════════════════════════════════════
// ACCORDION
// ════════════════════════════════════════════════════════════

function toggleAccordion(header) {
    const item = header.parentElement;
    item.classList.toggle('open');
}


// ════════════════════════════════════════════════════════════
// СКВАЖИНА — ИНКЛИНОМЕТРИЯ
// ════════════════════════════════════════════════════════════

function setInputMode(mode) {
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.toggle-btn[data-mode="${mode}"]`).classList.add('active');
    document.getElementById('manual-input').style.display = mode === 'manual' ? '' : 'none';
    document.getElementById('file-input').style.display = mode === 'file' ? '' : 'none';
}

function makeSurveyRow(depth, incl, azim) {
    const tbody = document.getElementById('survey-tbody');
    const idx = tbody.rows.length + 1;
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="row-num">${idx}</td>
        <td><input type="number" step="any" value="${depth ?? ''}" placeholder="0"></td>
        <td><input type="number" step="any" value="${incl ?? ''}" placeholder="0"></td>
        <td><input type="number" step="any" value="${azim ?? ''}" placeholder="0"></td>
        <td><button class="btn-row-delete" onclick="deleteSurveyRow(this)">&times;</button></td>
    `;
    tbody.appendChild(tr);
}

function addSurveyRow() { makeSurveyRow('', '', ''); }

function removeSurveyRow() {
    const tbody = document.getElementById('survey-tbody');
    if (tbody.rows.length) tbody.deleteRow(tbody.rows.length - 1);
    renumberRows('survey-tbody');
}

function deleteSurveyRow(btn) {
    btn.closest('tr').remove();
    renumberRows('survey-tbody');
}

function renumberRows(tbodyId) {
    const rows = document.getElementById(tbodyId).rows;
    for (let i = 0; i < rows.length; i++) {
        const numCell = rows[i].querySelector('.row-num');
        if (numCell) numCell.textContent = i + 1;
    }
}

function getSurveyData() {
    const rows = document.getElementById('survey-tbody').rows;
    const survey = [];
    for (const row of rows) {
        const inputs = row.querySelectorAll('input');
        const d = parseFloat(inputs[0].value);
        const i = parseFloat(inputs[1].value);
        const a = parseFloat(inputs[2].value);
        if (!isNaN(d) && !isNaN(i) && !isNaN(a)) {
            survey.push({ depth: toSI(d, 'depth'), inclination: i, azimuth: a });
        }
    }
    return survey;
}

function loadSampleSurvey() {
    const sample = [
        [0, 0, 0], [200, 2, 45], [500, 8, 60], [800, 18, 75],
        [1100, 35, 85], [1400, 55, 90], [1700, 72, 92],
        [2000, 85, 93], [2300, 88, 95], [2600, 89, 96], [3000, 90, 97],
    ];
    document.getElementById('survey-tbody').innerHTML = '';
    sample.forEach(s => makeSurveyRow(s[0], s[1], s[2]));
}

// Файл-загрузка
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);

    const statusEl = document.getElementById('upload-status');
    statusEl.innerHTML = '<span class="spinner"></span> Загрузка...';

    fetch('/api/survey/upload', { method: 'POST', body: formData })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                statusEl.innerHTML = `<div class="alert alert-info">Загружено ${data.rows} точек замера</div>`;
                // Заполнить таблицу
                document.getElementById('survey-tbody').innerHTML = '';
                data.survey.forEach(s => makeSurveyRow(s.depth, s.inclination, s.azimuth));
                setInputMode('manual');
            } else {
                statusEl.innerHTML = `<div class="alert alert-error">${data.error}</div>`;
            }
        })
        .catch(e => {
            statusEl.innerHTML = `<div class="alert alert-error">Ошибка: ${e.message}</div>`;
        });
}

// Drag & drop
(function() {
    const zone = document.getElementById('upload-zone');
    if (!zone) return;
    ['dragenter', 'dragover'].forEach(ev => {
        zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('drag-over'); });
    });
    ['dragleave', 'drop'].forEach(ev => {
        zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('drag-over'); });
    });
    zone.addEventListener('drop', e => {
        const files = e.dataTransfer.files;
        if (files.length) {
            document.getElementById('file-upload').files = files;
            handleFileUpload({ target: { files } });
        }
    });
})();

// Инициализация: 3 пустые строки
for (let i = 0; i < 3; i++) addSurveyRow();


// ════════════════════════════════════════════════════════════
// КОЭФФИЦИЕНТ ТРЕНИЯ — ИНТЕРВАЛЫ
// ════════════════════════════════════════════════════════════

function addMuRow(from, to, mu) {
    const tbody = document.getElementById('mu-tbody');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="number" step="any" value="${from ?? ''}" placeholder="0"></td>
        <td><input type="number" step="any" value="${to ?? ''}" placeholder="3000"></td>
        <td><input type="number" step="0.01" value="${mu ?? ''}" placeholder="0.25"></td>
        <td><button class="btn-row-delete" onclick="this.closest('tr').remove()">&times;</button></td>
    `;
    tbody.appendChild(tr);
}

function getMuIntervals() {
    const rows = document.getElementById('mu-tbody').rows;
    const intervals = [];
    for (const row of rows) {
        const inputs = row.querySelectorAll('input');
        const from = parseFloat(inputs[0].value);
        const to = parseFloat(inputs[1].value);
        const mu = parseFloat(inputs[2].value);
        if (!isNaN(from) && !isNaN(to) && !isNaN(mu)) {
            intervals.push({ depth_from: toSI(from, 'depth'), depth_to: toSI(to, 'depth'), mu: mu });
        }
    }
    return intervals;
}

function updateMuZones() {
    const casingShoe = parseFloat(document.getElementById('shoe-casing').value);
    const linerTop   = parseFloat(document.getElementById('shoe-liner').value);
    const muOpen   = parseFloat(document.getElementById('mu-openhole').value) || 0.25;
    const muCased  = parseFloat(document.getElementById('mu-cased').value) || 0.20;
    const muLiner  = parseFloat(document.getElementById('mu-liner').value) || 0.15;

    // Remove auto-generated rows (marked with data-auto)
    const tbody = document.getElementById('mu-tbody');
    Array.from(tbody.rows).forEach(r => { if (r.dataset.auto) r.remove(); });

    // Generate new auto zones
    const zones = [];
    if (!isNaN(casingShoe) && casingShoe > 0) {
        zones.push({ from: 0, to: casingShoe, mu: muCased });
        if (!isNaN(linerTop) && linerTop > casingShoe) {
            zones.push({ from: casingShoe, to: linerTop, mu: muLiner });
            zones.push({ from: linerTop, to: 99999, mu: muOpen });
        } else {
            zones.push({ from: casingShoe, to: 99999, mu: muOpen });
        }
    } else if (!isNaN(linerTop) && linerTop > 0) {
        zones.push({ from: 0, to: linerTop, mu: muLiner });
        zones.push({ from: linerTop, to: 99999, mu: muOpen });
    }

    // Insert auto rows at beginning
    zones.reverse().forEach(z => {
        const tr = document.createElement('tr');
        tr.dataset.auto = '1';
        tr.innerHTML = `
            <td><input type="number" step="any" value="${z.from}" placeholder="0"></td>
            <td><input type="number" step="any" value="${z.to === 99999 ? '' : z.to}" placeholder="99999"></td>
            <td><input type="number" step="0.01" value="${z.mu}" placeholder="0.25"></td>
            <td><button class="btn-row-delete" onclick="this.closest('tr').remove()">&times;</button></td>
        `;
        tbody.insertBefore(tr, tbody.firstChild);
    });
    showInfo('Зоны μ обновлены');
}


// ════════════════════════════════════════════════════════════
// КОМПОНОВКА
// ════════════════════════════════════════════════════════════

function makeAssemblyRow(name, len, weight, od, maxLoad, wtPerUnit) {
    const tbody = document.getElementById('assembly-tbody');
    const idx = tbody.rows.length + 1;
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="row-num">${idx}</td>
        <td><input type="text" value="${name ?? ''}" placeholder="Элемент"></td>
        <td><input type="number" step="any" value="${len ?? ''}" placeholder="0"></td>
        <td><input type="number" step="any" value="${weight ?? ''}" placeholder="0"></td>
        <td><input type="number" step="any" value="${od ?? ''}" placeholder="0"></td>
        <td><input type="number" step="any" value="${wtPerUnit ?? ''}" placeholder="0"></td>
        <td><input type="number" step="any" value="${maxLoad ?? ''}" placeholder="0"></td>
        <td><button class="btn-row-delete" onclick="deleteAssemblyRow(this)">&times;</button></td>
    `;
    tbody.appendChild(tr);
    // Auto-calculate weight from wtPerUnit if weight empty
    const inputs = tr.querySelectorAll('input[type="number"]');
    const lenInp    = inputs[0]; // index in number inputs: len
    const weightInp = inputs[1];
    const wtPuInp   = inputs[3]; // wtPerUnit
    wtPuInp.addEventListener('input', () => {
        const l = parseFloat(lenInp.value);
        const w = parseFloat(weightInp.value);
        const wpu = parseFloat(wtPuInp.value);
        if (!isNaN(l) && !isNaN(wpu) && (isNaN(w) || w === 0)) {
            weightInp.value = (l * wpu).toFixed(1);
            updateAssemblySummary();
        }
    });
    lenInp.addEventListener('input', () => {
        const l = parseFloat(lenInp.value);
        const w = parseFloat(weightInp.value);
        const wpu = parseFloat(wtPuInp.value);
        if (!isNaN(l) && !isNaN(wpu) && (isNaN(w) || w === 0)) {
            weightInp.value = (l * wpu).toFixed(1);
            updateAssemblySummary();
        }
    });
}

function addAssemblyRow() { makeAssemblyRow('', '', '', '', '', ''); }

function removeAssemblyRow() {
    const tbody = document.getElementById('assembly-tbody');
    if (tbody.rows.length) tbody.deleteRow(tbody.rows.length - 1);
    renumberRows('assembly-tbody');
    updateAssemblySummary();
}

function deleteAssemblyRow(btn) {
    btn.closest('tr').remove();
    renumberRows('assembly-tbody');
    updateAssemblySummary();
}

function clearAssembly() {
    document.getElementById('assembly-tbody').innerHTML = '';
    updateAssemblySummary();
}

function getAssemblyData() {
    const rows = document.getElementById('assembly-tbody').rows;
    const assembly = [];
    for (const row of rows) {
        const inputs = row.querySelectorAll('input');
        // inputs: name(text), len, weight, od, wtPerUnit, maxLoad
        const nameInp  = inputs[0];
        const numInputs = row.querySelectorAll('input[type="number"]');
        const name = nameInp.value || `Элемент ${assembly.length + 1}`;
        const lenRaw     = parseFloat(numInputs[0].value);
        const weightRaw  = parseFloat(numInputs[1].value);
        const odRaw      = parseFloat(numInputs[2].value) || 0;
        const wtPuRaw    = parseFloat(numInputs[3].value) || 0;
        const maxLoadRaw = parseFloat(numInputs[4].value);

        // Convert to SI
        const len     = isNaN(lenRaw)     ? NaN : toSI(lenRaw, 'depth');
        const od      = toSI(odRaw, 'od');
        const wtPu    = toSI(wtPuRaw, 'linwt');
        const maxLoad = isNaN(maxLoadRaw) ? NaN : toSI(maxLoadRaw, 'force');

        let weight;
        if (!isNaN(weightRaw) && weightRaw > 0) {
            weight = toSI(weightRaw, 'weight');
        } else if (wtPu > 0 && !isNaN(len)) {
            // compute from linear weight: kg/m * m = kg
            weight = wtPu * len;
        } else {
            weight = isNaN(weightRaw) ? NaN : 0;
        }

        if (!isNaN(len) && !isNaN(weight) && !isNaN(maxLoad)) {
            assembly.push({ name, length: len, weight_air: weight, od, max_load: maxLoad, weight_per_unit: wtPu });
        }
    }
    return assembly;
}

function updateAssemblySummary() {
    const assembly = getAssemblyData();  // already in SI
    const totalLen    = assembly.reduce((s, e) => s + e.length, 0);
    const totalWeight = assembly.reduce((s, e) => s + e.weight_air, 0);
    const fdSI = toSI(parseFloat(document.getElementById('fluid-density').value) || 1.2, 'dens');
    const bf = 1 - fdSI / 7.85;
    const buoyed = totalWeight * bf * 9.81 / 1000;  // kN

    // Display in current unit system
    const dispLen    = fromSI(totalLen, 'depth');
    const dispWeight = fromSI(totalWeight, 'weight');

    const lenUnit    = UNITS[unitSystem].depth;
    const weightUnit = UNITS[unitSystem].weight;

    document.getElementById('total-length').innerHTML    = dispLen.toFixed(1) + `<span class="stat-unit">${lenUnit}</span>`;
    document.getElementById('total-weight').innerHTML    = dispWeight.toFixed(0) + `<span class="stat-unit">${weightUnit}</span>`;
    document.getElementById('buoyed-weight').innerHTML   = buoyed.toFixed(1) + '<span class="stat-unit">кН</span>';

    // Vertical weight using trajectory inclination
    const vertWeightEl = document.getElementById('vert-weight');
    const survey = getSurveyData();  // already SI depths
    if (survey.length >= 2 && assembly.length > 0) {
        let vertWeight = 0;
        let depthAccum = 0;
        for (const elem of assembly) {
            const topDepth = depthAccum;
            const botDepth = depthAccum + elem.length;
            const midDepth = (topDepth + botDepth) / 2;
            // Interpolate inclination at midDepth
            let avgIncl = 0;
            for (let i = 1; i < survey.length; i++) {
                if (survey[i].depth >= midDepth) {
                    const frac = (midDepth - survey[i-1].depth) / (survey[i].depth - survey[i-1].depth);
                    avgIncl = survey[i-1].inclination + frac * (survey[i].inclination - survey[i-1].inclination);
                    break;
                }
                avgIncl = survey[survey.length-1].inclination;
            }
            const inclRad = avgIncl * Math.PI / 180;
            // Effective vertical component (kN): weight_air * cos(incl) * g / 1000
            vertWeight += elem.weight_air * Math.cos(inclRad) * 9.81 / 1000;
            depthAccum += elem.length;
        }
        if (vertWeightEl) vertWeightEl.innerHTML = vertWeight.toFixed(1) + '<span class="stat-unit">кН</span>';
    } else {
        if (vertWeightEl) vertWeightEl.innerHTML = '—<span class="stat-unit">кН</span>';
    }

    document.getElementById('total-elements').textContent = assembly.length;
}

function loadSampleAssembly() {
    document.getElementById('assembly-tbody').innerHTML = '';
    // [name, len(m), weight(kg), od(mm), maxLoad(kN), wtPerUnit(kg/m)]
    const sample = [
        ['Долото PDC 215.9 мм', 0.3,  45,    215.9, 500,  223.2],
        ['Забойный двигатель',  9.5,  1800,  172,   800,  283.0],
        ['КНБК (немагнитная)',  9.0,  450,   171,   700,  74.4],
        ['УБТ 178×71',          54,   8640,  178,   2400, 238.1],
        ['Бурильные трубы 127×9.19', 2900, 66700, 127, 1800, 34.2],
    ];
    sample.forEach(s => makeAssemblyRow(s[0], s[1], s[2], s[3], s[4], s[5]));
    updateAssemblySummary();
}

function updatePackerSelect() {
    const assembly = getAssemblyData();
    const sel = document.getElementById('packer-element-select');
    const prev = sel.value;
    sel.innerHTML = '<option value="">— Выберите —</option>';
    assembly.forEach((e, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `${i + 1}. ${e.name}`;
        sel.appendChild(opt);
    });
    if (prev !== '') sel.value = prev;
}


// ════════════════════════════════════════════════════════════
// ОБЩИЕ ФУНКЦИИ
// ════════════════════════════════════════════════════════════

function collectRequestData(targetDepth) {
    return {
        survey: getSurveyData(),
        assembly: getAssemblyData(),
        target_depth: toSI(targetDepth, 'depth'),
        fluid_density: toSI(parseFloat(document.getElementById('fluid-density').value) || 1.2, 'dens'),
        mu_default: parseFloat(document.getElementById('mu-openhole').value) || 0.25,
        mu_intervals: getMuIntervals(),
    };
}

function showToast(msg, type = 'error', duration = 5000) {
    const icons = { error: '✕', success: '✓', info: 'ℹ' };
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type] || '!'}</span>` +
                   `<span class="toast-msg">${msg}</span>` +
                   `<span class="toast-close" onclick="this.parentElement.remove()">×</span>`;
    container.appendChild(el);
    setTimeout(() => {
        el.style.animation = 'toast-out 0.25s ease forwards';
        setTimeout(() => el.remove(), 260);
    }, duration);
}

function showError(msg)   { showToast(msg, 'error'); }
function showSuccess(msg) { showToast(msg, 'success'); }
function showInfo(msg)    { showToast(msg, 'info'); }

async function apiPost(url, data) {
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return resp.json();
}


// ════════════════════════════════════════════════════════════
// РАСЧЁТ 1 — ДОХОДИМОСТЬ
// ════════════════════════════════════════════════════════════

async function calcReachability() {
    const td = parseFloat(document.getElementById('reach-target-depth').value);
    if (!td || td <= 0) { showError('Укажите целевую глубину'); return; }

    const data = collectRequestData(td);
    if (data.survey.length < 2) { showError('Введите минимум 2 точки инклинометрии'); return; }
    if (!data.assembly.length) { showError('Заполните компоновку'); return; }

    document.getElementById('reach-spinner').style.display = '';
    document.getElementById('btn-calc-reach').disabled = true;
    document.getElementById('reach-results').style.display = 'none';

    try {
        const res = await apiPost('/api/calculate/reachability', data);
        document.getElementById('reach-results').style.display = '';

        if (!res.success) {
            document.getElementById('reach-status-box').className = 'result-box error';
            document.getElementById('reach-status-box').innerHTML = `
                <span class="result-icon">&#10060;</span>
                <div class="result-text"><span class="result-title">${res.error}</span></div>`;
            return;
        }

        state.results.reachability = res;

        // Статус
        const box = document.getElementById('reach-status-box');
        if (res.reaches) {
            box.className = 'result-box success';
            box.innerHTML = `
                <span class="result-icon">&#10004;</span>
                <div class="result-text">
                    <span class="result-title">Компоновка доходит до ${td} м</span>
                    <span class="result-subtitle">Нагрузка на крюке при спуске: ${res.hook_load} кН</span>
                </div>`;
        } else {
            box.className = 'result-box error';
            box.innerHTML = `
                <span class="result-icon">&#10060;</span>
                <div class="result-text">
                    <span class="result-title">Компоновка НЕ доходит</span>
                    <span class="result-subtitle">Критическая глубина: ${res.critical_depth} м</span>
                </div>`;
        }

        // Статистика
        document.getElementById('reach-stats').innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Нагрузка на крюке</div>
                <div class="stat-value">${res.hook_load}<span class="stat-unit">кН</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Суммарное трение</div>
                <div class="stat-value">${res.total_friction}<span class="stat-unit">кН</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-label">${res.reaches ? 'Статус' : 'Крит. глубина'}</div>
                <div class="stat-value">${res.reaches ? '<span style="color:var(--success)">OK</span>' : res.critical_depth + '<span class="stat-unit">м</span>'}</div>
            </div>`;

        // График
        const depths = res.forces.map(f => f.depth);
        const forces = res.forces.map(f => f.force);
        const trace = {
            x: forces, y: depths,
            type: 'scatter', mode: 'lines+markers',
            line: { color: '#3d5afe', width: 2 },
            marker: { size: 4, color: '#3d5afe' },
            name: 'Осевая нагрузка',
            fill: 'tozerox', fillcolor: 'rgba(61,90,254,0.06)',
        };
        _plot('reach-chart', [trace], {
            xaxis: { title: 'Осевая нагрузка (кН)' },
            yaxis: { autorange: 'reversed', title: 'Глубина (м)' },
        });

        // Таблица
        const tbody = document.getElementById('reach-force-tbody');
        tbody.innerHTML = '';
        res.forces.forEach(f => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${f.depth}</td><td>${f.element}</td><td>${f.force}</td><td>${f.friction}</td>`;
            tbody.appendChild(tr);
        });

    } catch (e) {
        showError('Ошибка: ' + e.message);
    } finally {
        document.getElementById('reach-spinner').style.display = 'none';
        document.getElementById('btn-calc-reach').disabled = false;
    }
}


// ════════════════════════════════════════════════════════════
// РАСЧЁТ 2 — ПАКЕР
// ════════════════════════════════════════════════════════════

async function calcPacker() {
    const psf = parseFloat(document.getElementById('packer-set-force').value);
    const pidx = document.getElementById('packer-element-select').value;
    const td = parseFloat(document.getElementById('packer-target-depth').value);

    if (!psf || psf <= 0) { showError('Укажите усилие посадки пакера'); return; }
    if (pidx === '') { showError('Выберите элемент-пакер'); return; }
    if (!td || td <= 0) { showError('Укажите целевую глубину'); return; }

    const data = collectRequestData(td);
    data.packer_set_force = psf;
    data.packer_element_index = parseInt(pidx);

    if (data.survey.length < 2) { showError('Введите минимум 2 точки инклинометрии'); return; }
    if (!data.assembly.length) { showError('Заполните компоновку'); return; }

    document.getElementById('packer-spinner').style.display = '';
    document.getElementById('btn-calc-packer').disabled = true;
    document.getElementById('packer-results').style.display = 'none';

    try {
        const res = await apiPost('/api/calculate/packer', data);
        document.getElementById('packer-results').style.display = '';

        if (!res.success) {
            document.getElementById('packer-status-box').className = 'result-box error';
            document.getElementById('packer-status-box').innerHTML = `
                <span class="result-icon">&#10060;</span>
                <div class="result-text"><span class="result-title">${res.error}</span></div>`;
            return;
        }

        state.results.packer = res;

        const box = document.getElementById('packer-status-box');
        if (res.is_safe) {
            box.className = 'result-box success';
            box.innerHTML = `
                <span class="result-icon">&#10004;</span>
                <div class="result-text">
                    <span class="result-title">Срыв пакера безопасен</span>
                    <span class="result-subtitle">Запас прочности: ${res.min_safety_pct}%</span>
                </div>`;
        } else {
            box.className = 'result-box warning';
            box.innerHTML = `
                <span class="result-icon">&#9888;</span>
                <div class="result-text">
                    <span class="result-title">Превышена допустимая нагрузка</span>
                    <span class="result-subtitle">Слабейший элемент: ${res.weakest_element ? res.weakest_element.name : '—'}</span>
                </div>`;
        }

        // Статистика
        const we = res.weakest_element || {};
        document.getElementById('packer-stats').innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Нагрузка на крюке</div>
                <div class="stat-value">${res.hook_load}<span class="stat-unit">кН</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Глубина пакера</div>
                <div class="stat-value">${res.packer_depth}<span class="stat-unit">м</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Слабейший элемент</div>
                <div class="stat-value" style="font-size:14px">${we.name || '—'}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Запас прочности</div>
                <div class="stat-value" style="color:${res.is_safe ? 'var(--success)' : 'var(--warning)'}">${res.min_safety_pct || '—'}<span class="stat-unit">%</span></div>
            </div>`;

        // Таблица проверки
        const tbody = document.getElementById('packer-check-tbody');
        tbody.innerHTML = '';
        (res.element_checks || []).forEach(e => {
            const tr = document.createElement('tr');
            const badge = e.ok ? '<span class="badge badge-ok">OK</span>' : '<span class="badge badge-warn">!</span>';
            tr.innerHTML = `<td>${e.name}</td><td>${e.max_load}</td><td>${e.actual_force}</td><td>${e.safety_pct}</td><td>${badge}</td>`;
            tbody.appendChild(tr);
        });

    } catch (e) {
        showError('Ошибка: ' + e.message);
    } finally {
        document.getElementById('packer-spinner').style.display = 'none';
        document.getElementById('btn-calc-packer').disabled = false;
    }
}


// ════════════════════════════════════════════════════════════
// РАСЧЁТ 3 — ВЕС НА КРЮКЕ
// ════════════════════════════════════════════════════════════

async function calcHookload() {
    const td = parseFloat(document.getElementById('hook-target-depth').value);
    if (!td || td <= 0) { showError('Укажите целевую глубину'); return; }

    const data = collectRequestData(td);
    if (data.survey.length < 2) { showError('Введите минимум 2 точки инклинометрии'); return; }
    if (!data.assembly.length) { showError('Заполните компоновку'); return; }

    document.getElementById('hook-spinner').style.display = '';
    document.getElementById('btn-calc-hook').disabled = true;
    document.getElementById('hook-results').style.display = 'none';

    try {
        const res = await apiPost('/api/calculate/hookload', data);
        document.getElementById('hook-results').style.display = '';

        if (!res.success) {
            showError(res.error);
            return;
        }

        state.results.hookload = res;

        // Статистика
        document.getElementById('hook-stats').innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Макс. вес на крюке</div>
                <div class="stat-value">${res.hook_load}<span class="stat-unit">кН</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Вес колонны в воздухе</div>
                <div class="stat-value">${res.total_weight_air}<span class="stat-unit">кН</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Разница (трение)</div>
                <div class="stat-value">${(res.hook_load - res.total_weight_air).toFixed(1)}<span class="stat-unit">кН</span></div>
            </div>`;

        // График
        const depths = res.forces.map(f => f.depth);
        const forces = res.forces.map(f => f.force);
        const trace = {
            x: forces, y: depths,
            type: 'scatter', mode: 'lines+markers',
            line: { color: '#00bcd4', width: 2 },
            marker: { size: 4, color: '#00bcd4' },
            name: 'Вес на крюке',
            fill: 'tozerox', fillcolor: 'rgba(0,188,212,0.06)',
        };
        _plot('hook-chart', [trace], {
            xaxis: { title: 'Осевая нагрузка (кН)' },
            yaxis: { autorange: 'reversed', title: 'Глубина (м)' },
        });

        // Таблица
        const tbody = document.getElementById('hook-force-tbody');
        tbody.innerHTML = '';
        res.forces.forEach(f => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${f.depth}</td><td>${f.element}</td><td>${f.force}</td><td>${f.friction}</td>`;
            tbody.appendChild(tr);
        });

    } catch (e) {
        showError('Ошибка: ' + e.message);
    } finally {
        document.getElementById('hook-spinner').style.display = 'none';
        document.getElementById('btn-calc-hook').disabled = false;
    }
}


// ════════════════════════════════════════════════════════════
// РАСЧЁТ 4 — TORQUE & DRAG
// ════════════════════════════════════════════════════════════

async function calcTorqueDrag() {
    const td = parseFloat(document.getElementById('td-target-depth').value);
    if (!td || td <= 0) { showError('Укажите целевую глубину'); return; }

    const data = collectRequestData(td);
    if (data.survey.length < 2) { showError('Введите минимум 2 точки инклинометрии'); return; }
    if (!data.assembly.length)  { showError('Заполните компоновку'); return; }

    document.getElementById('td-spinner').style.display = '';
    document.getElementById('btn-calc-td').disabled = true;
    document.getElementById('td-results').style.display = 'none';

    try {
        const res = await apiPost('/api/calculate/torque_drag', data);

        if (!res.success) { showError(res.error); return; }

        state.results.torqueDrag = res;
        document.getElementById('td-results').style.display = '';

        // ── KPI Stats ──
        const dragWindow = (res.hookload_pooh - res.hookload_rih).toFixed(1);
        document.getElementById('td-kpi-stats').innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Нагрузка на крюке RIH</div>
                <div class="stat-value">${res.hookload_rih}<span class="stat-unit">кН</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Нагрузка на крюке POOH</div>
                <div class="stat-value">${res.hookload_pooh}<span class="stat-unit">кН</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Окно трения (POOH−RIH)</div>
                <div class="stat-value">${dragWindow}<span class="stat-unit">кН</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Момент на устье</div>
                <div class="stat-value">${res.torque_surface}<span class="stat-unit">кН·м</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Вес в воздухе</div>
                <div class="stat-value">${res.W_air_kN}<span class="stat-unit">кН</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Вес с поправкой BF</div>
                <div class="stat-value">${res.W_buoy_kN}<span class="stat-unit">кН</span></div>
            </div>`;

        // ── Совмещённый Drag-график (RIH + POOH) ──
        const depRih  = res.forces_rih.map(f => f.depth);
        const fRih    = res.forces_rih.map(f => f.force);
        const depPooh = res.forces_pooh.map(f => f.depth);
        const fPooh   = res.forces_pooh.map(f => f.force);

        // Глубины оси — объединяем и сортируем по убыванию
        const allDepths = [...new Set([...depRih, ...depPooh])].sort((a,b) => b - a);
        const traceRih = {
            x: fRih, y: depRih,
            type: 'scatter', mode: 'lines',
            line: { color: '#3d5afe', width: 2.5 },
            name: 'Спуск — RIH',
            fill: 'none',
        };
        const tracePooh = {
            x: fPooh, y: depPooh,
            type: 'scatter', mode: 'lines',
            line: { color: '#00c853', width: 2.5 },
            name: 'Подъём — POOH',
        };
        // Заливка «окно трения»
        const traceFill = {
            x: [...fRih, ...fPooh.slice().reverse()],
            y: [...depRih, ...depPooh.slice().reverse()],
            type: 'scatter', mode: 'none',
            fill: 'toself',
            fillcolor: 'rgba(255,171,0,0.07)',
            name: 'Окно трения',
            hoverinfo: 'skip',
            line: { width: 0 },
        };
        const traceZero = {
            x: [0, 0], y: [Math.max(...depRih, ...depPooh), 0],
            type: 'scatter', mode: 'lines',
            line: { color: '#4a4d65', width: 1, dash: 'dash' },
            name: '0 кН', showlegend: false,
        };

        _plot('td-drag-chart', [traceFill, traceRih, tracePooh, traceZero], {
            xaxis: { title: 'Осевая нагрузка (кН)', zeroline: true, zerolinewidth: 1 },
            yaxis: { autorange: 'reversed', title: 'Глубина (м)' },
            height: 360,
        });

        // ── Torque-график ──
        const depT = res.torque.map(t => t.depth);
        const torq = res.torque.map(t => t.torque);
        const traceTorq = {
            x: torq, y: depT,
            type: 'scatter', mode: 'lines+markers',
            line: { color: '#ffab00', width: 2.5 },
            marker: { size: 4, color: '#ffab00' },
            fill: 'tozerox',
            fillcolor: 'rgba(255,171,0,0.06)',
            name: 'Момент',
        };
        _plot('td-torque-chart', [traceTorq], {
            xaxis: { title: 'Крутящий момент (кН·м)' },
            yaxis: { autorange: 'reversed', title: 'Глубина (м)' },
            height: 320,
        });

        // ── Трение по элементам (горизонтальный bar) ──
        const segs  = res.segments || [];
        const names = segs.map(s => s.name);
        const frRih  = segs.map(s => s.friction_rih);
        const frPooh = segs.map(s => s.friction_pooh);

        const barRih = {
            x: frRih, y: names,
            type: 'bar', orientation: 'h',
            name: 'Спуск RIH',
            marker: { color: 'rgba(61,90,254,0.75)' },
        };
        const barPooh = {
            x: frPooh, y: names,
            type: 'bar', orientation: 'h',
            name: 'Подъём POOH',
            marker: { color: 'rgba(0,200,83,0.75)' },
        };
        _plot('td-friction-chart', [barRih, barPooh], {
            yaxis: { autorange: 'reversed', title: '', automargin: true },
            xaxis: { title: 'Сила трения (кН)' },
            barmode: 'group',
            height: Math.max(220, segs.length * 32 + 60),
            margin: { l: 160, r: 20, t: 36, b: 50 },
        });

        // ── Таблица по элементам ──
        const segTbody = document.getElementById('td-seg-tbody');
        segTbody.innerHTML = '';
        segs.forEach(s => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${s.name}</td>
                <td>${s.top}</td>
                <td>${s.N}</td>
                <td>${s.F_rih_top}</td>
                <td>${s.F_pooh_top}</td>
                <td>${s.friction_rih}</td>
                <td>${s.friction_pooh}</td>
                <td>${s.torque_dT}</td>
                <td>${s.mu}</td>`;
            segTbody.appendChild(tr);
        });

        // ── Продольный изгиб ──
        const buck = res.buckling || [];
        const buckDiv = document.getElementById('td-buckling-content');
        if (!buck.length) {
            buckDiv.innerHTML = `<div class="result-box success">
                <span class="result-icon">&#10004;</span>
                <div class="result-text">
                    <span class="result-title">Сжатых сегментов не обнаружено</span>
                    <span class="result-subtitle">Риск потери устойчивости отсутствует при данных условиях</span>
                </div></div>`;
        } else {
            const hasHelical = buck.some(b => b.status === 'helical');
            const hasSin     = buck.some(b => b.status === 'sinusoidal');
            const alertClass = hasHelical ? 'error' : hasSin ? 'warning' : 'success';
            const alertMsg   = hasHelical
                ? '⚠ Обнаружен спиральный изгиб — требуется пересмотр компоновки'
                : '⚠ Обнаружен синусоидальный изгиб';
            let html = `<div class="result-box ${alertClass}" style="margin-bottom:12px">
                <span class="result-icon">${hasHelical ? '&#9888;' : '&#9888;'}</span>
                <div class="result-text"><span class="result-title">${alertMsg}</span></div>
            </div>
            <div class="table-wrap">
            <table class="data-table">
                <thead><tr>
                    <th>Элемент</th><th>Глубина (м)</th><th>Сжатие (кН)</th>
                    <th>F_cr_sin (кН)</th><th>F_cr_hel (кН)</th><th>Статус</th>
                </tr></thead>
                <tbody>`;
            const statusLabel = {
                ok:         '<span class="buck-ok">Норма</span>',
                sinusoidal: '<span class="buck-sin">Синус. изгиб</span>',
                helical:    '<span class="buck-hel">⚠ Спир. изгиб</span>',
            };
            buck.forEach(b => {
                const rowClass = b.status === 'helical' ? 'buck-row-hel'
                               : b.status === 'sinusoidal' ? 'buck-row-sin' : '';
                html += `<tr class="${rowClass}">
                    <td>${b.name}</td>
                    <td>${b.top}–${b.bottom}</td>
                    <td>${b.compression}</td>
                    <td>${b.F_cr_sin}</td>
                    <td>${b.F_cr_hel}</td>
                    <td>${statusLabel[b.status] || b.status}</td>
                </tr>`;
            });
            html += '</tbody></table></div>';
            buckDiv.innerHTML = html;
        }

    } catch(e) {
        showError('Ошибка T&D: ' + e.message);
    } finally {
        document.getElementById('td-spinner').style.display = 'none';
        document.getElementById('btn-calc-td').disabled = false;
    }
}


// ════════════════════════════════════════════════════════════
// ЭКСПОРТ
// ════════════════════════════════════════════════════════════

function getExportData() {
    const td = parseFloat(document.getElementById('reach-target-depth').value)
            || parseFloat(document.getElementById('hook-target-depth').value)
            || parseFloat(document.getElementById('packer-target-depth').value)
            || parseFloat(document.getElementById('td-target-depth').value)
            || 0;
    const data = collectRequestData(td);
    data.packer_set_force = parseFloat(document.getElementById('packer-set-force').value) || 0;
    data.packer_element_index = parseInt(document.getElementById('packer-element-select').value) || 0;
    return data;
}

async function exportPDF() {
    const data = getExportData();
    if (data.survey.length < 2 || !data.assembly.length) {
        showError('Заполните данные скважины и компоновки перед экспортом');
        return;
    }
    try {
        const resp = await fetch('/api/export/pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!resp.ok) throw new Error('Ошибка сервера');
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'wellmech_report.pdf';
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        showError('Ошибка экспорта PDF: ' + e.message);
    }
}

async function exportExcel() {
    const data = getExportData();
    if (data.survey.length < 2 || !data.assembly.length) {
        showError('Заполните данные скважины и компоновки перед экспортом');
        return;
    }
    try {
        const resp = await fetch('/api/export/excel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!resp.ok) throw new Error('Ошибка сервера');
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'wellmech_data.xlsx';
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        showError('Ошибка экспорта Excel: ' + e.message);
    }
}


// ════════════════════════════════════════════════════════════
// СТАТУС ЧЕКЛИСТ (экспорт)
// ════════════════════════════════════════════════════════════

function updateStatusChecklist() {
    const survey = getSurveyData();
    const assembly = getAssemblyData();

    setStatus('status-survey', survey.length >= 2);
    setStatus('status-assembly', assembly.length > 0);
    setStatus('status-reach', !!state.results.reachability);
    setStatus('status-hook', !!state.results.hookload);
    setStatus('status-packer', !!state.results.packer);
    setStatus('status-td', !!state.results.torqueDrag);
}

function syncTdDepth() {
    // Копируем целевую глубину из расчёта 1 в поле T&D, если пустое
    const src = document.getElementById('reach-target-depth').value
             || document.getElementById('hook-target-depth').value;
    const dst = document.getElementById('td-target-depth');
    if (src && !dst.value) dst.value = src;
}

function setStatus(id, done) {
    const el = document.getElementById(id);
    if (!el) return;
    if (done) el.classList.add('done');
    else el.classList.remove('done');
}


// ════════════════════════════════════════════════════════════
// ВИЗ УАЛИЗАЦИЯ СКВАЖИНЫ
// ════════════════════════════════════════════════════════════

let _vizData = null;  // cached trajectory points

async function buildTrajectory() {
    const survey = getSurveyData();
    if (survey.length < 2) { showError('Введите минимум 2 точки инклинометрии'); return; }

    document.getElementById('traj-spinner').style.display = '';
    document.getElementById('btn-build-traj').disabled = true;
    document.getElementById('viz-results').style.display = 'none';

    try {
        const res = await apiPost('/api/calculate/trajectory', { survey });
        if (!res.success) { showError(res.error); return; }

        _vizData = res;
        state.trajectory = res;
        document.getElementById('viz-results').style.display = '';

        // KPI
        document.getElementById('traj-kpi').innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Макс. TVD</div>
                <div class="stat-value">${res.max_tvd}<span class="stat-unit">м</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Горизонтальное смещение</div>
                <div class="stat-value">${res.max_hd}<span class="stat-unit">м</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Макс. DLS</div>
                <div class="stat-value">${res.max_dls}<span class="stat-unit">°/30м</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Точек замера</div>
                <div class="stat-value">${res.points.length}</div>
            </div>`;

        renderVizTab('2d');
        populateTrajTable(res.points);

    } catch(e) {
        showError('Ошибка: ' + e.message);
    } finally {
        document.getElementById('traj-spinner').style.display = 'none';
        document.getElementById('btn-build-traj').disabled = false;
    }
}

function switchVizTab(tab) {
    ['2d','plan','3d','dls'].forEach(t => {
        document.getElementById(`viz-${t}`).style.display = t === tab ? '' : 'none';
        document.getElementById(`viz-btn-${t}`).classList.toggle('active', t === tab);
    });
    if (_vizData) renderVizTab(tab);
}

function renderVizTab(tab) {
    if (!_vizData) return;
    const pts = _vizData.points;
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';

    if (tab === '2d') {
        // Вертикальный профиль: горизонтальное расстояние vs TVD
        const trace = {
            x: pts.map(p => p.hd),
            y: pts.map(p => p.tvd),
            type: 'scatter', mode: 'lines+markers',
            line: { color: '#3d5afe', width: 2.5 },
            marker: { size: 5, color: pts.map(p => p.inc),
                      colorscale: 'Viridis', showscale: true,
                      colorbar: { title: 'Угол (°)', thickness: 12,
                                  tickfont: { color: dark ? '#8b8fa8' : '#4a506e' },
                                  titlefont: { color: dark ? '#8b8fa8' : '#4a506e' } } },
            name: 'Траектория',
        };
        _plot('viz-2d', [trace], {
            xaxis: { title: 'Горизонтальное расстояние (м)' },
            yaxis: { autorange: 'reversed', title: 'TVD (м)' },
            height: 480,
        });
    } else if (tab === 'plan') {
        // Вид в плане: N vs E
        const trace = {
            x: pts.map(p => p.east),
            y: pts.map(p => p.north),
            type: 'scatter', mode: 'lines+markers',
            line: { color: '#ffab00', width: 2.5 },
            marker: { size: 5, color: '#ffab00' },
            name: 'Трасса в плане',
        };
        const start = { x: [0], y: [0], type: 'scatter', mode: 'markers',
                        marker: { size: 12, color: '#00c853', symbol: 'star' }, name: 'Устье' };
        const end   = { x: [pts[pts.length-1].east], y: [pts[pts.length-1].north],
                        type: 'scatter', mode: 'markers',
                        marker: { size: 12, color: '#ff1744', symbol: 'x' }, name: 'Забой' };
        _plot('viz-plan', [trace, start, end], {
            xaxis: { title: 'Восток (м)', scaleanchor: 'y' },
            yaxis: { autorange: undefined, title: 'Север (м)' },
            height: 480,
        });
    } else if (tab === '3d') {
        // 3D
        const assembly = getAssemblyData();
        const totalLen = assembly.reduce((s,e) => s+e.length, 0);
        const trace3d = {
            x: pts.map(p => p.east),
            y: pts.map(p => p.north),
            z: pts.map(p => -p.tvd),
            type: 'scatter3d', mode: 'lines+markers',
            line: { color: pts.map(p => p.inc), colorscale: 'Viridis', width: 5 },
            marker: { size: 3 },
            name: 'Траектория',
        };
        const bg3 = dark ? '#0a0b12' : '#f4f6fb';
        const grid3 = dark ? '#1e2035' : '#d5daf0';
        const txt3  = dark ? '#8b8fa8' : '#4a506e';
        _plot('viz-3d', [trace3d], {
            scene: {
                bgcolor: bg3,
                xaxis: { title: 'Восток (м)', gridcolor: grid3, tickfont: { color: txt3 } },
                yaxis: { title: 'Север (м)',  gridcolor: grid3, tickfont: { color: txt3 } },
                zaxis: { title: 'TVD (м)',    gridcolor: grid3, tickfont: { color: txt3 } },
                camera: { eye: { x: 1.5, y: 1.5, z: 0.8 } },
            },
            paper_bgcolor: bg3,
            margin: { l: 0, r: 0, t: 0, b: 0 },
            height: 520,
        }, { scrollZoom: true });
    } else if (tab === 'dls') {
        // DLS vs MD
        const colors = pts.map(p =>
            p.dls > 3 ? '#ff1744' : p.dls > 1.5 ? '#ffab00' : '#00c853');
        const trace = {
            x: pts.map(p => p.dls),
            y: pts.map(p => p.md),
            type: 'scatter', mode: 'lines+markers',
            line: { color: '#3d5afe', width: 2 },
            marker: { size: 7, color: colors },
            name: 'DLS',
        };
        _plot('viz-dls', [trace], {
            xaxis: { title: 'DLS (°/30м)' },
            yaxis: { autorange: 'reversed', title: 'MD (м)' },
            height: 360,
        });
    }
}

function populateTrajTable(pts) {
    const tbody = document.getElementById('traj-tbody');
    tbody.innerHTML = '';
    pts.forEach(p => {
        const dlsCls = p.dls > 3 ? 'dls-cell-high' : p.dls > 1.5 ? 'dls-cell-mid' : '';
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${p.md}</td><td>${p.inc}</td><td>${p.azi}</td>
            <td>${p.tvd}</td><td>${p.north}</td><td>${p.east}</td>
            <td>${p.hd}</td><td class="${dlsCls}">${p.dls}</td>`;
        tbody.appendChild(tr);
    });
}


// ════════════════════════════════════════════════════════════
// АНАЛИТИКА — ДАШБОРД
// ════════════════════════════════════════════════════════════

function refreshAnalytics() {
    const td = state.results.torqueDrag;
    const reach = state.results.reachability;
    const hook  = state.results.hookload;

    const grid = document.getElementById('analytics-kpi');
    if (!td && !reach && !hook) return;

    let cards = '';
    if (td) {
        const df_pct = (td.drag_factor * 100).toFixed(1);
        const dfClass = td.drag_factor > 0.4 ? 'danger' : td.drag_factor > 0.25 ? 'warn' : 'ok';
        cards += kpiCard('Нагрузка POOH', td.hookload_pooh, 'кН', '', '');
        cards += kpiCard('Нагрузка RIH',  td.hookload_rih,  'кН', '', '');
        cards += kpiCard('Окно трения',   (td.hookload_pooh - td.hookload_rih).toFixed(1), 'кН', '', dfClass);
        cards += kpiCard('Момент на устье', td.torque_surface, 'кН·м', '', '');
        cards += kpiCard('Drag-фактор',   df_pct, '%', '', dfClass);
        cards += kpiCard('Вес BF', td.W_buoy_kN, 'кН', '', '');
    }
    if (reach) {
        const rcClass = reach.reaches ? 'ok' : 'danger';
        cards += kpiCard('Доходимость', reach.reaches ? 'Да ✓' : 'Нет ✗', '', '', rcClass);
    }
    if (td && td.buckling && td.buckling.length) {
        const worst = td.buckling.reduce((a,b) => b.status === 'helical' ? b :
                      (a.status === 'helical' ? a : b), {status:'ok'});
        const bc = worst.status === 'helical' ? 'danger' : worst.status === 'sinusoidal' ? 'warn' : 'ok';
        const bl = { ok:'Нет изгиба', sinusoidal:'Синус. изгиб', helical:'Спир. изгиб' };
        cards += kpiCard('Изгиб', bl[worst.status] || '—', '', '', bc);
    }
    if (td && td.stuck_pipe) {
        const highCount = td.stuck_pipe.filter(s => s.risk === 'high').length;
        const sc = highCount > 0 ? 'danger' : 'ok';
        cards += kpiCard('Прихват (высокий риск)', highCount, 'уч.', '', sc);
    }

    grid.innerHTML = cards || '<div class="kpi-card"><div class="kpi-label">Нет данных</div></div>';

    // Stuck pipe section
    if (td && td.stuck_pipe) renderStuckPipe(td.stuck_pipe);
    // Alerts auto-check
    checkAlerts();
}

function kpiCard(label, value, unit, delta, cls) {
    return `<div class="kpi-card ${cls}">
        <div class="kpi-label">${label}</div>
        <div class="kpi-value">${value}<span class="kpi-unit">${unit}</span></div>
        ${delta ? `<div class="kpi-delta">${delta}</div>` : ''}
    </div>`;
}


// ════════════════════════════════════════════════════════════
// СИСТЕМА ПРЕДУПРЕЖДЕНИЙ
// ════════════════════════════════════════════════════════════

function checkAlerts() {
    const td    = state.results.torqueDrag;
    const reach = state.results.reachability;
    if (!td && !reach) return;

    const hl_pooh = td?.hookload_pooh ?? 0;
    const hl_rih  = td?.hookload_rih  ?? 0;
    const torq    = td?.torque_surface ?? 0;
    const drag    = td?.total_drag_pooh ?? 0;

    setAlert('alert-st-hookload-pooh',
        hl_pooh, parseFloat(document.getElementById('alert-hookload-pooh').value));
    const rihLimit = parseFloat(document.getElementById('alert-hookload-rih').value);
    if (rihLimit > 0)
        setAlert('alert-st-hookload-rih', hl_rih, rihLimit);
    else
        document.getElementById('alert-st-hookload-rih').innerHTML = '—';
    setAlert('alert-st-torque',
        torq, parseFloat(document.getElementById('alert-torque').value));
    setAlert('alert-st-drag',
        drag, parseFloat(document.getElementById('alert-drag').value));
}

function setAlert(elId, actual, limit) {
    const el = document.getElementById(elId);
    if (!el || isNaN(limit)) return;
    if (actual > limit) {
        el.innerHTML = `<span class="alert-fired">⚠ ${actual.toFixed(1)}</span>`;
    } else {
        el.innerHTML = `<span class="alert-ok">OK ${actual.toFixed(1)}</span>`;
    }
}


// ════════════════════════════════════════════════════════════
// ПРИХВАТ ТРУБЫ
// ════════════════════════════════════════════════════════════

function renderStuckPipe(riskData) {
    const container = document.getElementById('stuck-pipe-content');
    if (!container) return;

    const highCount = riskData.filter(r => r.risk === 'high').length;
    const midCount  = riskData.filter(r => r.risk === 'medium').length;

    let html = `<div class="stats-row" style="margin-bottom:16px">
        <div class="stat-card">
            <div class="stat-label">Высокий риск</div>
            <div class="stat-value" style="color:${highCount>0?'var(--danger)':'var(--success)'}">
                ${highCount}
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Средний риск</div>
            <div class="stat-value" style="color:${midCount>0?'var(--warning)':'var(--text-primary)'}">
                ${midCount}
            </div>
        </div>
    </div>`;

    // Bar chart: N/L по элементам
    const names  = riskData.map(r => r.name);
    const nPerM  = riskData.map(r => r.N_per_m);
    const colors = riskData.map(r =>
        r.risk === 'high' ? '#ff1744' : r.risk === 'medium' ? '#ffab00' : '#00c853');

    html += `<div class="chart-container" id="stuck-chart" style="min-height:220px;margin-bottom:16px"></div>`;

    html += `<div class="table-wrap"><table class="data-table">
        <thead><tr>
            <th>Элемент</th><th>Глубина (м)</th><th>N (кН)</th>
            <th>N/L (кН/м)</th><th>Угол (°)</th><th>Риск</th>
        </tr></thead><tbody>`;

    riskData.forEach(r => {
        const badge = `<span class="risk-badge ${r.risk}">
            ${r.risk==='high'?'Высокий':r.risk==='medium'?'Средний':'Низкий'}
        </span>`;
        html += `<tr><td>${r.name}</td><td>${r.top}–${r.bottom}</td>
            <td>${r.N}</td><td>${r.N_per_m}</td><td>${r.incl}</td><td>${badge}</td></tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;

    // Render bar chart
    setTimeout(() => {
        _plot('stuck-chart', [{
            x: nPerM, y: names,
            type: 'bar', orientation: 'h',
            marker: { color: colors },
            name: 'N/L (кН/м)',
        }], {
            xaxis: { title: 'Удельная нормальная нагрузка N/L (кН/м)' },
            yaxis: { autorange: 'reversed', automargin: true },
            margin: { l: 160, r: 20, t: 20, b: 50 },
            height: Math.max(220, riskData.length * 32 + 60),
            shapes: [
                { type: 'line', x0: 1, x1: 1, y0: -0.5, y1: riskData.length - 0.5,
                  line: { color: '#ffab00', width: 1.5, dash: 'dot' } },
                { type: 'line', x0: 3, x1: 3, y0: -0.5, y1: riskData.length - 0.5,
                  line: { color: '#ff1744', width: 1.5, dash: 'dot' } },
            ],
        });
    }, 50);
}


// ════════════════════════════════════════════════════════════
// КАЛИБРОВКА КОЭФФИЦИЕНТА ТРЕНИЯ
// ════════════════════════════════════════════════════════════

function addCalibRow(depth, hl) {
    const tbody = document.getElementById('calib-tbody');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="number" step="any" value="${depth??''}" placeholder="0"></td>
        <td><input type="number" step="any" value="${hl??''}"    placeholder="0"></td>
        <td><button class="btn-row-delete" onclick="this.closest('tr').remove()">&times;</button></td>`;
    tbody.appendChild(tr);
}

function loadSampleCalib() {
    document.getElementById('calib-tbody').innerHTML = '';
    [[500,60],[1000,120],[1500,180],[2000,250],[2500,330],[3000,420]].forEach(
        ([d,h]) => addCalibRow(d, h));
}

function getCalibData() {
    const rows = document.getElementById('calib-tbody').rows;
    const data = [];
    for (const r of rows) {
        const ins = r.querySelectorAll('input');
        const d = parseFloat(ins[0].value), h = parseFloat(ins[1].value);
        if (!isNaN(d) && !isNaN(h)) data.push({ depth: d, hookload: h });
    }
    return data;
}

async function runCalibration() {
    const fieldData = getCalibData();
    if (!fieldData.length) { showError('Добавьте полевые замеры'); return; }
    const td = parseFloat(document.getElementById('calib-depth').value);
    if (!td) { showError('Укажите целевую глубину'); return; }

    const survey   = getSurveyData();
    const assembly = getAssemblyData();
    if (survey.length < 2) { showError('Введите инклинометрию'); return; }
    if (!assembly.length)  { showError('Заполните компоновку'); return; }

    document.getElementById('calib-spinner').style.display = '';
    document.getElementById('btn-calibrate').disabled = true;
    document.getElementById('calib-results').style.display = 'none';

    try {
        const res = await apiPost('/api/calibrate/friction', {
            survey, assembly,
            target_depth: td,
            fluid_density: parseFloat(document.getElementById('fluid-density').value) || 1.2,
            field_data: fieldData,
            direction: document.getElementById('calib-direction').value,
        });
        if (!res.success) { showError(res.error); return; }

        state.calibratedMu = res.mu_calibrated;
        document.getElementById('calib-results').style.display = '';
        document.getElementById('calib-mu-val').textContent  = res.mu_calibrated;
        document.getElementById('calib-rms').textContent     = res.rms_error;

        // Comparison chart
        const comp = res.comparison;
        const trMeas = {
            x: comp.map(c => c.measured),    y: comp.map(c => c.depth),
            type: 'scatter', mode: 'markers',
            marker: { color: '#ffab00', size: 9, symbol: 'diamond' },
            name: 'Измеренный',
        };
        const trCalc = {
            x: res.forces.map(f => f.force), y: res.forces.map(f => f.depth),
            type: 'scatter', mode: 'lines',
            line: { color: '#3d5afe', width: 2 },
            name: `Расчётный (μ=${res.mu_calibrated})`,
        };
        _plot('calib-chart', [trMeas, trCalc], {
            xaxis: { title: 'Нагрузка на крюке (кН)' },
            yaxis: { autorange: 'reversed', title: 'Глубина (м)' },
            height: 300,
        });

        // Comparison table
        const tbody = document.getElementById('calib-comp-tbody');
        tbody.innerHTML = '';
        comp.forEach(c => {
            const absErr = Math.abs(c.error);
            const cls = absErr > 20 ? 'color:var(--danger)' :
                        absErr > 10 ? 'color:var(--warning)' : 'color:var(--success)';
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${c.depth}</td><td>${c.measured}</td><td>${c.calculated}</td>
                <td style="${cls}">${c.error > 0 ? '+' : ''}${c.error}</td>
                <td style="${cls}">${c.error_pct > 0 ? '+' : ''}${c.error_pct}%</td>`;
            tbody.appendChild(tr);
        });

    } catch(e) {
        showError('Ошибка калибровки: ' + e.message);
    } finally {
        document.getElementById('calib-spinner').style.display = 'none';
        document.getElementById('btn-calibrate').disabled = false;
    }
}

function applyCalibration() {
    if (!state.calibratedMu) return;
    document.getElementById('mu-openhole').value = state.calibratedMu;
    document.getElementById('mu-cased').value    = state.calibratedMu;
    showSuccess(`Применено μ = ${state.calibratedMu} для открытого ствола и обсадной колонны`);
}


// ════════════════════════════════════════════════════════════
// API 5CT — ПОДБОР ОБСАДНЫХ ТРУБ
// ════════════════════════════════════════════════════════════

const API5CT_DATA = [
    // Tubing
    {od:2.375, wt:4.6,   grade:'J55',  wall:0.190, yield:55,  type:'EUE'},
    {od:2.375, wt:4.6,   grade:'N80',  wall:0.190, yield:80,  type:'EUE'},
    {od:2.875, wt:6.5,   grade:'J55',  wall:0.217, yield:55,  type:'EUE'},
    {od:2.875, wt:6.5,   grade:'N80',  wall:0.217, yield:80,  type:'EUE'},
    {od:3.5,   wt:9.3,   grade:'J55',  wall:0.254, yield:55,  type:'EUE'},
    {od:3.5,   wt:9.3,   grade:'N80',  wall:0.254, yield:80,  type:'EUE'},
    {od:4.5,   wt:12.6,  grade:'J55',  wall:0.271, yield:55,  type:'EUE'},
    {od:4.5,   wt:12.6,  grade:'N80',  wall:0.271, yield:80,  type:'EUE'},
    // Casing
    {od:4.5,   wt:9.5,   grade:'J55',  wall:0.205, yield:55,  type:'STC'},
    {od:4.5,   wt:11.6,  grade:'J55',  wall:0.250, yield:55,  type:'BTC'},
    {od:4.5,   wt:13.5,  grade:'N80',  wall:0.290, yield:80,  type:'BTC'},
    {od:5.0,   wt:11.5,  grade:'J55',  wall:0.220, yield:55,  type:'STC'},
    {od:5.0,   wt:15.0,  grade:'N80',  wall:0.296, yield:80,  type:'BTC'},
    {od:5.5,   wt:14.0,  grade:'J55',  wall:0.244, yield:55,  type:'STC'},
    {od:5.5,   wt:17.0,  grade:'N80',  wall:0.304, yield:80,  type:'BTC'},
    {od:5.5,   wt:20.0,  grade:'L80',  wall:0.361, yield:80,  type:'BTC'},
    {od:5.5,   wt:23.0,  grade:'P110', wall:0.415, yield:110, type:'BTC'},
    {od:7.0,   wt:17.0,  grade:'J55',  wall:0.231, yield:55,  type:'STC'},
    {od:7.0,   wt:23.0,  grade:'N80',  wall:0.317, yield:80,  type:'BTC'},
    {od:7.0,   wt:26.0,  grade:'L80',  wall:0.362, yield:80,  type:'BTC'},
    {od:7.0,   wt:29.0,  grade:'P110', wall:0.408, yield:110, type:'BTC'},
    {od:7.625, wt:24.0,  grade:'N80',  wall:0.300, yield:80,  type:'BTC'},
    {od:7.625, wt:33.7,  grade:'P110', wall:0.430, yield:110, type:'BTC'},
    {od:9.625, wt:32.3,  grade:'J55',  wall:0.312, yield:55,  type:'STC'},
    {od:9.625, wt:36.0,  grade:'N80',  wall:0.352, yield:80,  type:'BTC'},
    {od:9.625, wt:43.5,  grade:'L80',  wall:0.435, yield:80,  type:'BTC'},
    {od:9.625, wt:47.0,  grade:'P110', wall:0.472, yield:110, type:'BTC'},
    {od:10.75, wt:32.75, grade:'J55',  wall:0.279, yield:55,  type:'STC'},
    {od:10.75, wt:40.5,  grade:'N80',  wall:0.350, yield:80,  type:'BTC'},
    {od:13.375,wt:48.0,  grade:'J55',  wall:0.330, yield:55,  type:'STC'},
    {od:13.375,wt:54.5,  grade:'N80',  wall:0.380, yield:80,  type:'BTC'},
    {od:13.375,wt:61.0,  grade:'L80',  wall:0.430, yield:80,  type:'BTC'},
    {od:18.625,wt:87.5,  grade:'J55',  wall:0.435, yield:55,  type:'STC'},
    {od:20.0,  wt:94.0,  grade:'H40',  wall:0.438, yield:40,  type:'STC'},
];

const threadFactor = { BTC: 0.85, LTC: 0.75, STC: 0.60, EUE: 0.80, NUE: 0.65 };

function calcApi5ct(pipe) {
    const id_in  = pipe.od - 2 * pipe.wall;
    const A_mm2  = Math.PI / 4 * (pipe.od * pipe.od - id_in * id_in) * 645.16;
    const F_body = A_mm2 * pipe.yield * 6.895 / 1000;  // kN
    const tf     = threadFactor[pipe.type] || 0.75;
    const F_thread = F_body * tf;
    const P_burst    = 0.875 * 2 * pipe.yield * pipe.wall / pipe.od * 6.895;  // MPa
    const P_collapse = 0.75 * P_burst;
    return {
        F_body:    F_body.toFixed(1),
        F_thread:  F_thread.toFixed(1),
        P_burst:   P_burst.toFixed(1),
        P_collapse: P_collapse.toFixed(1),
        od_mm:     (pipe.od * 25.4).toFixed(1),
        wall_mm:   (pipe.wall * 25.4).toFixed(2),
    };
}

let _api5ctSelected = null;

function filterApi5ct() {
    const odF    = document.getElementById('api5ct-od-filter').value;
    const gradeF = document.getElementById('api5ct-grade-filter').value;
    const typeF  = document.getElementById('api5ct-type-filter').value;

    const filtered = API5CT_DATA.filter(p => {
        if (odF    && String(p.od)    !== odF)    return false;
        if (gradeF && p.grade         !== gradeF) return false;
        if (typeF  && p.type          !== typeF)  return false;
        return true;
    });

    const tbody = document.getElementById('api5ct-tbody');
    tbody.innerHTML = '';
    filtered.forEach((pipe, idx) => {
        const calc = calcApi5ct(pipe);
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.innerHTML = `
            <td>${pipe.od} / ${calc.od_mm}</td>
            <td>${pipe.wt}</td>
            <td>${pipe.grade}</td>
            <td>${calc.wall_mm}</td>
            <td>${pipe.type}</td>
            <td>${calc.F_body}</td>
            <td>${calc.F_thread}</td>
            <td>${calc.P_burst}</td>
            <td>${calc.P_collapse}</td>
            <td><button class="btn btn-ghost btn-sm" onclick="selectApi5ct(${idx}, event)">&#10003;</button></td>
        `;
        tr.addEventListener('click', () => selectApi5ctByPipe(pipe, calc));
        tbody.appendChild(tr);
    });

    // Store filtered for selection
    tbody._filteredData = filtered;
    // Hide detail
    document.getElementById('api5ct-detail').style.display = 'none';
}

function selectApi5ct(idx, e) {
    if (e) e.stopPropagation();
    const tbody = document.getElementById('api5ct-tbody');
    const filtered = tbody._filteredData || API5CT_DATA;
    const pipe = filtered[idx];
    if (!pipe) return;
    const calc = calcApi5ct(pipe);
    selectApi5ctByPipe(pipe, calc);
}

function selectApi5ctByPipe(pipe, calc) {
    _api5ctSelected = { pipe, calc };
    const det = document.getElementById('api5ct-detail');
    const content = document.getElementById('api5ct-detail-content');
    det.style.display = '';
    content.innerHTML = `
        <div class="stats-row" style="flex-wrap:wrap;gap:8px">
            <div class="stat-card"><div class="stat-label">OD</div>
                <div class="stat-value">${pipe.od}<span class="stat-unit">in</span></div></div>
            <div class="stat-card"><div class="stat-label">OD (мм)</div>
                <div class="stat-value">${calc.od_mm}<span class="stat-unit">мм</span></div></div>
            <div class="stat-card"><div class="stat-label">Вес</div>
                <div class="stat-value">${pipe.wt}<span class="stat-unit">lb/ft</span></div></div>
            <div class="stat-card"><div class="stat-label">Марка</div>
                <div class="stat-value">${pipe.grade}</div></div>
            <div class="stat-card"><div class="stat-label">Резьба</div>
                <div class="stat-value">${pipe.type}</div></div>
            <div class="stat-card"><div class="stat-label">Толщина</div>
                <div class="stat-value">${calc.wall_mm}<span class="stat-unit">мм</span></div></div>
            <div class="stat-card"><div class="stat-label">F тело</div>
                <div class="stat-value">${calc.F_body}<span class="stat-unit">кН</span></div></div>
            <div class="stat-card"><div class="stat-label">F резьба</div>
                <div class="stat-value">${calc.F_thread}<span class="stat-unit">кН</span></div></div>
            <div class="stat-card"><div class="stat-label">P разрыв</div>
                <div class="stat-value">${calc.P_burst}<span class="stat-unit">МПа</span></div></div>
            <div class="stat-card"><div class="stat-label">P смятие</div>
                <div class="stat-value">${calc.P_collapse}<span class="stat-unit">МПа</span></div></div>
        </div>`;
    // Pre-fill element name
    const nameInp = document.getElementById('api5ct-element-name');
    if (nameInp && !nameInp.value) {
        nameInp.value = `${pipe.grade} ${pipe.od}" ${pipe.wt}lb/ft ${pipe.type}`;
    }
}

function addApi5ctToAssembly() {
    if (!_api5ctSelected) { showError('Выберите трубу из таблицы'); return; }
    const { pipe, calc } = _api5ctSelected;
    const nameInp = document.getElementById('api5ct-element-name');
    const lenInp  = document.getElementById('api5ct-element-len');
    const name = nameInp.value || `${pipe.grade} ${pipe.od}" casing`;
    const lenSI = parseFloat(lenInp.value) || 0;

    // Values in SI (mm OD, kg/m linear weight, kN max load)
    const od_mm   = parseFloat(calc.od_mm);
    const wt_kgm  = pipe.wt * 1.48816;  // lb/ft -> kg/m
    const weight  = wt_kgm * lenSI;
    const maxLoad = parseFloat(calc.F_thread);

    // Display in current unit system
    const lenDisp    = fromSI(lenSI, 'depth');
    const weightDisp = fromSI(weight, 'weight');
    const odDisp     = fromSI(od_mm, 'od');
    const wtPuDisp   = fromSI(wt_kgm, 'linwt');
    const maxLoadDisp = fromSI(maxLoad, 'force');

    makeAssemblyRow(name, lenDisp.toFixed(2), weightDisp.toFixed(1),
                    odDisp.toFixed(2), maxLoadDisp.toFixed(1), wtPuDisp.toFixed(2));
    renumberRows('assembly-tbody');
    updateAssemblySummary();
    // Clear form
    nameInp.value = '';
    lenInp.value  = '';
    showSuccess(`Добавлен элемент: ${name}`);
    // Switch to assembly tab
    goToTab('assembly');
}

// Initialize API 5CT table on load
(function initApi5ct() {
    filterApi5ct();
})();
