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
    applyUnitLabels();   // also updates thumb position
    convertInputValues();
    updateAssemblySummary();
}

function applyUnitLabels() {
    // Update label spans
    document.querySelectorAll('.unit-lbl[data-unit]').forEach(el => {
        const type = el.getAttribute('data-unit');
        if (UNITS[unitSystem][type]) el.textContent = UNITS[unitSystem][type];
    });
    // Toggle label shows CURRENT active system
    const lbl = document.getElementById('units-toggle-label');
    if (lbl) lbl.textContent = unitSystem === 'field' ? 'Field Units' : 'SI';
    // Thumb position: right = field active
    const thumb = document.getElementById('units-toggle-thumb');
    if (thumb) thumb.style.transform = unitSystem === 'field' ? 'translateX(20px)' : '';
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
        // [0]=len(depth), [1]=weight, [2]=od, [3]=wtPerUnit(linwt), [4]=maxLoad(force)
        const types = ['depth', 'weight', 'od', 'linwt', 'force'];
        inputs.forEach((inp, i) => {
            const type = types[i];
            if (!type) return;
            // Don't convert auto-calculated maxLoad — recalculate it instead
            if (i === 4 && inp.dataset.auto === 'true') { inp.value = ''; return; }
            const val = parseFloat(inp.value);
            if (!isNaN(val) && val !== 0) {
                if (unitSystem === 'field') {
                    inp.value = (val / FIELD_TO_SI[type]).toFixed(4).replace(/\.?0+$/, '');
                } else {
                    inp.value = (val * FIELD_TO_SI[type]).toFixed(4).replace(/\.?0+$/, '');
                }
            }
        });
        // Re-trigger auto-calc of maxLoad after unit switch
        autoCalcMaxLoad(row);
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
    // Convert formation-tbody depth column
    const fmRows = document.getElementById('formation-tbody')?.rows || [];
    for (const row of fmRows) {
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
    // Convert centralizer-tbody depth column
    const centRows = document.getElementById('centralizer-tbody')?.rows || [];
    for (const row of centRows) {
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
}

// Init unit system on load
(function initUnits() {
    applyUnitLabels();  // sets label text + thumb position
})();

// ── Состояние приложения ──
const state = {
    survey: [],
    assembly: [],
    trajectory: null,
    calibratedMu: null,
    results: { reachability: null, hookload: null, packer: null, torqueDrag: null },
    rig: { hookCapacity: null, maxTorque: null, maxRpm: null },
};


// ════════════════════════════════════════════════════════════
// ПРОЕКТ — СОХРАНЕНИЕ / ЗАГРУЗКА
// ════════════════════════════════════════════════════════════

const WM_PROJECTS_KEY = 'wm-projects';
let _autoSaveTimer = null;

function getProjectData() {
    // Collect all current app data into a serialisable object
    const survey = [];
    document.getElementById('survey-tbody').querySelectorAll('tr').forEach(tr => {
        const ins = tr.querySelectorAll('input');
        survey.push({ depth: ins[0]?.value, incl: ins[1]?.value, azim: ins[2]?.value });
    });

    const assembly = [];
    document.getElementById('assembly-tbody').querySelectorAll('tr').forEach(tr => {
        const nums = tr.querySelectorAll('input[type="number"]');
        const name = tr.querySelector('input[type="text"]')?.value ?? '';
        const grade = tr.querySelector('select.grade-sel')?.value ?? '';
        const conn  = tr.querySelector('select.conn-sel')?.value ?? '';
        assembly.push({
            name,
            len: nums[0]?.value, weight: nums[1]?.value,
            od: nums[2]?.value, linwt: nums[3]?.value, maxLoad: nums[4]?.value,
            grade, conn,
        });
    });

    const muIntervals = [];
    document.getElementById('mu-tbody').querySelectorAll('tr').forEach(tr => {
        const ins = tr.querySelectorAll('input');
        muIntervals.push({ from: ins[0]?.value, to: ins[1]?.value, mu: ins[2]?.value });
    });

    const formations = [];
    document.getElementById('formation-tbody').querySelectorAll('tr').forEach(tr => {
        const ins = tr.querySelectorAll('input');
        const sel = tr.querySelector('select');
        formations.push({ depth: ins[0]?.value, name: ins[1]?.value, type: sel?.value ?? 'formation' });
    });

    const centralizers = [];
    document.getElementById('centralizer-tbody')?.querySelectorAll('tr').forEach(tr => {
        const ins = tr.querySelectorAll('input');
        const sel = tr.querySelector('select');
        centralizers.push({ depth: ins[0]?.value, type: sel?.value ?? 'rigid', standoff: ins[1]?.value });
    });

    return {
        version: 1,
        unitSystem,
        wellMeta: getWellMetadata(),
        fluidDensity: document.getElementById('fluid-density').value,
        muOpenhole: document.getElementById('mu-openhole').value,
        muCased:    document.getElementById('mu-cased').value,
        muLiner:    document.getElementById('mu-liner').value,
        shoeCasing: document.getElementById('shoe-casing').value,
        shoeLiner:  document.getElementById('shoe-liner').value,
        rigHookCapacity: document.getElementById('rig-hook-capacity')?.value ?? '',
        rigMaxTorque:    document.getElementById('rig-max-torque')?.value ?? '',
        rigMaxRpm:       document.getElementById('rig-max-rpm')?.value ?? '',
        tdStringModel: _tdStringModel,
        survey,
        assembly,
        muIntervals,
        formations,
        centralizers,
        calcInputs: {
            reachDepth:    document.getElementById('reach-target-depth')?.value ?? '',
            hookDepth:     document.getElementById('hook-target-depth')?.value ?? '',
            hookMuMin:     document.getElementById('hook-mu-min')?.value ?? '',
            hookMuMax:     document.getElementById('hook-mu-max')?.value ?? '',
            hookPackerF:   document.getElementById('hook-packer-force')?.value ?? '',
            packerSetF:    document.getElementById('packer-set-force')?.value ?? '',
            packerDepth:   document.getElementById('packer-target-depth')?.value ?? '',
            tdDepth:       document.getElementById('td-target-depth')?.value ?? '',
            sensDepth:     document.getElementById('sens-target-depth')?.value ?? '',
        },
    };
}

function applyProjectData(data) {
    if (!data || data.version !== 1) { showError('Неверный формат файла проекта'); return; }

    // Well metadata
    if (data.wellMeta) applyWellMetadata(data.wellMeta);

    // Unit system
    if (data.unitSystem && data.unitSystem !== unitSystem) {
        unitSystem = data.unitSystem;
        localStorage.setItem('wm-units', unitSystem);
        applyUnitLabels();
    }

    // Well params
    if (data.fluidDensity) document.getElementById('fluid-density').value = data.fluidDensity;
    if (data.muOpenhole)   document.getElementById('mu-openhole').value = data.muOpenhole;
    if (data.muCased)      document.getElementById('mu-cased').value    = data.muCased;
    if (data.muLiner)      document.getElementById('mu-liner').value    = data.muLiner;
    if (data.shoeCasing)   document.getElementById('shoe-casing').value = data.shoeCasing;
    if (data.shoeLiner)    document.getElementById('shoe-liner').value  = data.shoeLiner;

    // Rig
    if (document.getElementById('rig-hook-capacity')) {
        document.getElementById('rig-hook-capacity').value = data.rigHookCapacity ?? '';
        document.getElementById('rig-max-torque').value    = data.rigMaxTorque    ?? '';
        document.getElementById('rig-max-rpm').value       = data.rigMaxRpm       ?? '';
    }

    // Survey
    document.getElementById('survey-tbody').innerHTML = '';
    (data.survey || []).forEach(s => makeSurveyRow(s.depth, s.incl, s.azim));
    if (document.getElementById('survey-tbody').rows.length === 0) {
        for (let i = 0; i < 3; i++) addSurveyRow();
    }

    // Assembly
    document.getElementById('assembly-tbody').innerHTML = '';
    (data.assembly || []).forEach(a => {
        makeAssemblyRow(a.name, a.len, a.weight, a.od, a.maxLoad, a.linwt, a.grade, a.conn);
    });
    updateAssemblySummary();

    // Mu intervals
    document.getElementById('mu-tbody').innerHTML = '';
    (data.muIntervals || []).forEach(m => addMuRow(m.from, m.to, m.mu));

    // Formation tops
    document.getElementById('formation-tbody').innerHTML = '';
    (data.formations || []).forEach(f => addFormationRow(f.depth, f.name, f.type));

    // Centralizers
    const centTbody = document.getElementById('centralizer-tbody');
    if (centTbody) {
        centTbody.innerHTML = '';
        (data.centralizers || []).forEach(c => addCentralizerRow(c.depth, c.type, parseFloat(c.standoff)));
    }

    // Stiff string model
    if (data.tdStringModel) setStringModel(data.tdStringModel);

    // Calc inputs
    const ci = data.calcInputs || {};
    const setV = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
    setV('reach-target-depth', ci.reachDepth);
    setV('hook-target-depth',  ci.hookDepth);
    setV('hook-mu-min',        ci.hookMuMin);
    setV('hook-mu-max',        ci.hookMuMax);
    setV('hook-packer-force',  ci.hookPackerF);
    setV('packer-set-force',   ci.packerSetF);
    setV('packer-target-depth',ci.packerDepth);
    setV('td-target-depth',    ci.tdDepth);
    setV('sens-target-depth',  ci.sensDepth);
}

function saveProject(silent = false) {
    const name = (document.getElementById('project-name')?.value || '').trim() || 'Без названия';
    const projects = JSON.parse(localStorage.getItem(WM_PROJECTS_KEY) || '{}');
    const key = 'proj_' + Date.now();
    // If a project with same name exists, overwrite it
    let existKey = Object.keys(projects).find(k => projects[k].name === name);
    if (existKey) {
        projects[existKey] = { name, ts: Date.now(), data: getProjectData() };
    } else {
        projects[key] = { name, ts: Date.now(), data: getProjectData() };
    }
    localStorage.setItem(WM_PROJECTS_KEY, JSON.stringify(projects));
    localStorage.setItem('wm-last-project', name);
    updateSavedLabel();
    if (!silent) showSuccess(`Проект «${name}» сохранён`);
}

function updateSavedLabel() {
    const lbl = document.getElementById('project-saved-label');
    if (!lbl) return;
    const now = new Date();
    lbl.textContent = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}

function newProject() {
    if (!confirm('Создать новый проект? Несохранённые данные будут потеряны.')) return;
    document.getElementById('project-name').value = '';
    document.getElementById('survey-tbody').innerHTML = '';
    for (let i = 0; i < 3; i++) addSurveyRow();
    document.getElementById('assembly-tbody').innerHTML = '';
    document.getElementById('mu-tbody').innerHTML = '';
    document.getElementById('formation-tbody').innerHTML = '';
    const _ct = document.getElementById('centralizer-tbody');
    if (_ct) _ct.innerHTML = '';
    updateAssemblySummary();
    setStringModel('soft');
    applyWellMetadata({ wellField:'', wellName:'', wellBore:'', wellCase:'' });
    document.getElementById('project-saved-label').textContent = '';
    showInfo('Новый проект создан');
}

function exportProject() {
    const name = (document.getElementById('project-name')?.value || '').trim() || 'wellmech-project';
    const data = getProjectData();
    data.projectName = name;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name.replace(/[^a-zA-Zа-яА-Я0-9_-]/g, '_') + '.wm';
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('Файл проекта экспортирован');
}

function importProject(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            applyProjectData(data);
            if (data.projectName) {
                const nameEl = document.getElementById('project-name');
                if (nameEl) nameEl.value = data.projectName;
            }
            showSuccess('Проект импортирован: ' + (data.projectName || 'без названия'));
        } catch (err) {
            showError('Ошибка чтения файла: ' + err.message);
        }
    };
    reader.readAsText(file);
    event.target.value = '';  // reset input
}

function showProjectList() {
    const modal = document.getElementById('project-modal');
    if (!modal) return;
    const container = document.getElementById('project-list-container');
    const projects = JSON.parse(localStorage.getItem(WM_PROJECTS_KEY) || '{}');
    const entries = Object.entries(projects).sort((a, b) => b[1].ts - a[1].ts);
    if (entries.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:13px">Нет сохранённых проектов</div>';
    } else {
        container.innerHTML = entries.map(([key, proj]) => {
            const dt = new Date(proj.ts);
            const dtStr = dt.toLocaleDateString('ru-RU') + ' ' + dt.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });
            const meta = proj.data?.wellMeta || {};
            const path = [meta.wellField, meta.wellName, meta.wellBore, meta.wellCase]
                .filter(Boolean).join(' › ');
            return `<div class="project-list-item" onclick="loadProjectByKey('${key}')">
                <div style="flex:1">
                    <div class="project-list-name">${proj.name}</div>
                    ${path ? `<div class="project-list-meta" style="color:var(--accent);font-size:10px">${path}</div>` : ''}
                    <div class="project-list-meta">${dtStr}</div>
                </div>
                <button class="project-list-del" onclick="event.stopPropagation();deleteProject('${key}')" title="Удалить">×</button>
            </div>`;
        }).join('');
    }
    modal.style.display = 'flex';
}

function closeProjectModal() {
    const modal = document.getElementById('project-modal');
    if (modal) modal.style.display = 'none';
}

function loadProjectByKey(key) {
    const projects = JSON.parse(localStorage.getItem(WM_PROJECTS_KEY) || '{}');
    const proj = projects[key];
    if (!proj) { showError('Проект не найден'); return; }
    applyProjectData(proj.data);
    const nameEl = document.getElementById('project-name');
    if (nameEl) nameEl.value = proj.name;
    closeProjectModal();
    showSuccess(`Проект «${proj.name}» загружен`);
}

function deleteProject(key) {
    const projects = JSON.parse(localStorage.getItem(WM_PROJECTS_KEY) || '{}');
    const name = projects[key]?.name || key;
    if (!confirm(`Удалить проект «${name}»?`)) return;
    delete projects[key];
    localStorage.setItem(WM_PROJECTS_KEY, JSON.stringify(projects));
    showProjectList();
}

// Auto-save every 30 seconds
function startAutoSave() {
    if (_autoSaveTimer) clearInterval(_autoSaveTimer);
    _autoSaveTimer = setInterval(() => saveProject(true), 30000);
}

// Restore last auto-saved session
function restoreLastSession() {
    const projects = JSON.parse(localStorage.getItem(WM_PROJECTS_KEY) || '{}');
    const lastName = localStorage.getItem('wm-last-project');
    if (!lastName) return;
    const entry = Object.values(projects).find(p => p.name === lastName);
    if (entry) {
        applyProjectData(entry.data);
        const nameEl = document.getElementById('project-name');
        if (nameEl) nameEl.value = entry.name;
    }
}

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
// ПЛАСТЫ И БАШМАКИ
// ════════════════════════════════════════════════════════════

function addFormationRow(depth, name, type) {
    const tbody = document.getElementById('formation-tbody');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="number" step="any" value="${depth ?? ''}" placeholder="0"></td>
        <td><input type="text" value="${name ?? ''}" placeholder="Башмак ОК / Название пласта" style="width:100%"></td>
        <td>
            <select class="form-input" style="padding:3px 4px;font-size:11px">
                <option value="casing_shoe" ${type==='casing_shoe'?'selected':''}>Башмак ОК</option>
                <option value="formation" ${(!type||type==='formation')?'selected':''}>Пласт</option>
                <option value="marker" ${type==='marker'?'selected':''}>Маркер</option>
            </select>
        </td>
        <td><button class="btn-row-delete" onclick="this.closest('tr').remove()">&times;</button></td>
    `;
    tbody.appendChild(tr);
}

function getFormationTops() {
    const rows = document.getElementById('formation-tbody')?.rows || [];
    const tops = [];
    for (const row of rows) {
        const ins = row.querySelectorAll('input');
        const sel = row.querySelector('select');
        const depth = parseFloat(ins[0]?.value);
        const name  = ins[1]?.value || '';
        const type  = sel?.value || 'formation';
        if (!isNaN(depth) && depth > 0) {
            tops.push({ depth: toSI(depth, 'depth'), name, type });
        }
    }
    return tops;
}

/**
 * Build Plotly shapes + annotations for formation tops on a depth chart.
 * depthUnit: 'm' or 'ft' (for display); returns {shapes, annotations} for layout.
 */
function formationAnnotations(tops) {
    const shapes = [];
    const annotations = [];
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';

    tops.forEach(top => {
        const dispDepth = fromSI(top.depth, 'depth');
        const isCasing = top.type === 'casing_shoe';
        const isMarker = top.type === 'marker';
        const color = isCasing ? '#00c853' : isMarker ? '#ffab00' : '#6b7280';
        const dash  = isCasing ? 'dashdot' : 'dot';

        shapes.push({
            type: 'line',
            x0: 0, x1: 1,
            xref: 'paper',
            y0: dispDepth, y1: dispDepth,
            yref: 'y',
            line: { color, width: 1.5, dash },
        });
        annotations.push({
            x: 1,
            xref: 'paper',
            y: dispDepth,
            yref: 'y',
            text: top.name || (isCasing ? 'Башмак' : 'Пласт'),
            showarrow: false,
            xanchor: 'right',
            yanchor: 'bottom',
            font: { size: 10, color },
            bgcolor: 'rgba(0,0,0,0)',
        });
    });
    return { shapes, annotations };
}

/**
 * Add formation top lines and rig capacity line to an already-rendered Plotly chart.
 */
function addDepthAnnotations(divId, tops, rigCapacityKN) {
    const el = document.getElementById(divId);
    if (!el || !el._fullLayout) return;

    const { shapes, annotations } = formationAnnotations(tops);

    // Rig hook capacity — horizontal line on force axis
    if (rigCapacityKN && rigCapacityKN > 0) {
        const capDisp = fromSI(rigCapacityKN, 'force');
        const maxDepth = fromSI(Math.max(...tops.map(t => t.depth), 4000), 'depth');
        shapes.push({
            type: 'line',
            x0: capDisp, x1: capDisp,
            y0: 0, y1: 1,
            xref: 'x', yref: 'paper',
            line: { color: '#ff1744', width: 2, dash: 'dash' },
        });
        annotations.push({
            x: capDisp, y: 0.02,
            xref: 'x', yref: 'paper',
            text: `Грузоп. ${capDisp.toFixed(0)} ${UNITS[unitSystem].force}`,
            showarrow: false,
            xanchor: 'left',
            font: { size: 10, color: '#ff1744' },
            bgcolor: 'rgba(0,0,0,0)',
        });
    }

    try {
        Plotly.relayout(divId, { shapes, annotations });
    } catch (e) { /* chart might not be ready */ }
}

// ════════════════════════════════════════════════════════════
// ЦЕНТРАЛИЗАТОРЫ
// ════════════════════════════════════════════════════════════

const CENTRALIZER_TYPES = {
    'rigid':    { label: 'Жёсткий',      standoff: 0.92 },
    'bow':      { label: 'Лепестковый',  standoff: 0.70 },
    'roller':   { label: 'Роликовый',    standoff: 0.82 },
    'custom':   { label: 'Пользов.',     standoff: 0.80 },
};

const _CENT_TYPE_HTML = Object.entries(CENTRALIZER_TYPES)
    .map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');

function addCentralizerRow(depth, type, standoff) {
    const tbody = document.getElementById('centralizer-tbody');
    if (!tbody) return;
    const typeVal = type || 'rigid';
    const defaultStandoff = standoff ?? (CENTRALIZER_TYPES[typeVal]?.standoff ?? 0.80);
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="number" step="any" value="${depth ?? ''}" placeholder="0"></td>
        <td>
            <select class="form-input cent-type-sel" style="padding:3px 4px;font-size:11px;width:100%"
                    onchange="onCentTypeChange(this)">
                ${_CENT_TYPE_HTML}
            </select>
        </td>
        <td><input type="number" step="0.01" min="0" max="1"
                   value="${defaultStandoff}" placeholder="0.80"></td>
        <td><button class="btn-row-delete" onclick="this.closest('tr').remove()">&times;</button></td>
    `;
    const sel = tr.querySelector('select');
    sel.value = typeVal;
    tbody.appendChild(tr);
}

function onCentTypeChange(sel) {
    const row = sel.closest('tr');
    const standoffInput = row.querySelectorAll('input')[1];
    const typeKey = sel.value;
    if (typeKey !== 'custom' && CENTRALIZER_TYPES[typeKey]) {
        standoffInput.value = CENTRALIZER_TYPES[typeKey].standoff;
    }
}

function getCentralizerData() {
    const rows = document.getElementById('centralizer-tbody')?.rows || [];
    const result = [];
    for (const row of rows) {
        const ins = row.querySelectorAll('input');
        const sel = row.querySelector('select');
        const depth = parseFloat(ins[0]?.value);
        const type = sel?.value || 'rigid';
        const standoff = parseFloat(ins[1]?.value);
        if (!isNaN(depth) && depth > 0 && !isNaN(standoff)) {
            result.push({ depth: toSI(depth, 'depth'), type, standoff });
        }
    }
    return result;
}


// ════════════════════════════════════════════════════════════
// BHA ШАБЛОНЫ
// ════════════════════════════════════════════════════════════

const WM_BHA_TEMPLATES_KEY = 'wm-bha-templates';

// Built-in default templates (read-only, shown with lock icon)
const BHA_DEFAULT_TEMPLATES = [
    {
        key: '__default_drill',
        name: 'Стандартная КНБК (бурение)',
        builtin: true,
        rows: [
            { name: 'Долото',           len: 0.5,   weight: 25,   od: 215.9, linwt: 50,  maxLoad: 300 },
            { name: 'PDM (забойный двигатель)', len: 8.0, weight: 800, od: 172.0, linwt: 100, maxLoad: 500 },
            { name: 'Немагнитная УБТ',  len: 9.0,   weight: 900,  od: 165.0, linwt: 100, maxLoad: 600 },
            { name: 'УБТ 165',          len: 90.0,  weight: 9000, od: 165.0, linwt: 100, maxLoad: 800 },
            { name: 'БТ 127',           len: 1800.0,weight: 72000,od: 127.0, linwt: 40,  maxLoad: 400 },
        ],
    },
    {
        key: '__default_casing',
        name: 'Обсадная колонна (спуск 245 мм)',
        builtin: true,
        rows: [
            { name: 'Башмак',           len: 1.5,   weight: 80,   od: 244.5, linwt: 50,  maxLoad: 1500 },
            { name: 'Обсадная труба 245', len: 2500.0, weight: 230000, od: 244.5, linwt: 92, maxLoad: 1500 },
        ],
    },
    {
        key: '__default_liner',
        name: 'Хвостовик (спуск 178 мм)',
        builtin: true,
        rows: [
            { name: 'Башмак хвостовика', len: 1.0,  weight: 40,   od: 177.8, linwt: 35,  maxLoad: 800 },
            { name: 'Хвостовик 178',    len: 800.0, weight: 50000,od: 177.8, linwt: 62,  maxLoad: 800 },
            { name: 'Подвеска хвостовика', len: 2.0, weight: 200, od: 177.8, linwt: 100, maxLoad: 800 },
        ],
    },
];

function saveBhaTemplate() {
    const name = prompt('Название шаблона КНБК:', 'Моя КНБК');
    if (!name) return;

    const rows = [];
    document.getElementById('assembly-tbody').querySelectorAll('tr').forEach(tr => {
        const nums = tr.querySelectorAll('input[type="number"]');
        const nameEl = tr.querySelector('input[type="text"]');
        rows.push({
            name:    nameEl?.value ?? '',
            len:     nums[0]?.value ?? '',
            weight:  nums[1]?.value ?? '',
            od:      nums[2]?.value ?? '',
            linwt:   nums[3]?.value ?? '',
            maxLoad: nums[4]?.value ?? '',
            grade:   tr.querySelector('select.grade-sel')?.value ?? '',
            conn:    tr.querySelector('select.conn-sel')?.value ?? '',
        });
    });

    if (!rows.length) { showError('Компоновка пуста — нечего сохранять'); return; }

    const templates = JSON.parse(localStorage.getItem(WM_BHA_TEMPLATES_KEY) || '{}');
    const key = 'bha_' + Date.now();
    templates[key] = { key, name, ts: Date.now(), unitSystem, rows };
    localStorage.setItem(WM_BHA_TEMPLATES_KEY, JSON.stringify(templates));
    showSuccess(`Шаблон «${name}» сохранён`);
}

function showBhaTemplates() {
    const modal = document.getElementById('bha-modal');
    if (!modal) return;

    const userTemplates = JSON.parse(localStorage.getItem(WM_BHA_TEMPLATES_KEY) || '{}');
    const allTemplates = [
        ...BHA_DEFAULT_TEMPLATES,
        ...Object.values(userTemplates).sort((a, b) => b.ts - a.ts),
    ];

    const listEl = document.getElementById('bha-template-list');
    if (!listEl) return;

    if (!allTemplates.length) {
        listEl.innerHTML = '<div style="color:var(--text-muted);padding:16px;text-align:center">Нет сохранённых шаблонов</div>';
    } else {
        listEl.innerHTML = allTemplates.map(t => {
            const dateStr = t.builtin ? 'Встроенный' : new Date(t.ts).toLocaleDateString('ru');
            const rowCount = t.rows.length;
            return `
            <div class="project-list-item" style="display:flex;justify-content:space-between;align-items:center">
                <div style="flex:1;cursor:pointer" onclick="loadBhaTemplate('${t.key}')">
                    <div style="font-weight:500">${t.builtin ? '🔒 ' : ''}${t.name}</div>
                    <div style="font-size:11px;color:var(--text-muted)">${dateStr} · ${rowCount} элем.</div>
                </div>
                ${t.builtin ? '' : `<button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteBhaTemplate('${t.key}')">✕</button>`}
            </div>`;
        }).join('');
    }

    modal.style.display = 'flex';
}

function loadBhaTemplate(key) {
    let tpl = BHA_DEFAULT_TEMPLATES.find(t => t.key === key);
    if (!tpl) {
        const userTemplates = JSON.parse(localStorage.getItem(WM_BHA_TEMPLATES_KEY) || '{}');
        tpl = userTemplates[key];
    }
    if (!tpl) { showError('Шаблон не найден'); return; }

    if (!confirm(`Загрузить шаблон «${tpl.name}»? Текущая компоновка будет заменена.`)) return;

    document.getElementById('assembly-tbody').innerHTML = '';

    // If template was saved in a different unit system, display values as-is (stored in display units at save time)
    tpl.rows.forEach(r => {
        makeAssemblyRow(r.name, r.len, r.weight, r.od, r.maxLoad, r.linwt, r.grade, r.conn);
    });

    renumberRows('assembly-tbody');
    updateAssemblySummary();
    closeBhaModal();
    showSuccess(`Шаблон «${tpl.name}» загружен (${tpl.rows.length} элем.)`);
}

function deleteBhaTemplate(key) {
    if (!confirm('Удалить шаблон?')) return;
    const templates = JSON.parse(localStorage.getItem(WM_BHA_TEMPLATES_KEY) || '{}');
    delete templates[key];
    localStorage.setItem(WM_BHA_TEMPLATES_KEY, JSON.stringify(templates));
    showBhaTemplates();   // refresh list
}

function closeBhaModal() {
    const modal = document.getElementById('bha-modal');
    if (modal) modal.style.display = 'none';
}

// ════════════════════════════════════════════════════════════
// КОМПОНОВКА
// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
// МАРКИ СТАЛИ — API 5CT / API 5DP
// ════════════════════════════════════════════════════════════

// yield_ksi = minimum yield strength, thread_factor = fraction of pipe-body yield
const STEEL_GRADES = {
    // ── API 5CT — Обсадные и насосно-компрессорные трубы ──
    'H40':      { yield_ksi: 40,  label: 'H40  (API 5CT)',       tf: 0.60 },
    'J55':      { yield_ksi: 55,  label: 'J55  (API 5CT)',       tf: 0.65 },
    'K55':      { yield_ksi: 55,  label: 'K55  (API 5CT)',       tf: 0.70 },
    'M65':      { yield_ksi: 65,  label: 'M65  (API 5CT)',       tf: 0.70 },
    'N80-1':    { yield_ksi: 80,  label: 'N80-1 (API 5CT)',      tf: 0.80 },
    'N80-Q':    { yield_ksi: 80,  label: 'N80-Q (API 5CT)',      tf: 0.80 },
    'L80-1':    { yield_ksi: 80,  label: 'L80-1 (API 5CT)',      tf: 0.80 },
    'L80-9Cr':  { yield_ksi: 80,  label: 'L80-9Cr (API 5CT)',    tf: 0.80 },
    'L80-13Cr': { yield_ksi: 80,  label: 'L80-13Cr (API 5CT)',   tf: 0.80 },
    'C90-1':    { yield_ksi: 90,  label: 'C90-1 (API 5CT)',      tf: 0.80 },
    'R95':      { yield_ksi: 95,  label: 'R95  (API 5CT)',       tf: 0.80 },
    'T95-1':    { yield_ksi: 95,  label: 'T95-1 (API 5CT)',      tf: 0.82 },
    'T95-2':    { yield_ksi: 95,  label: 'T95-2 (API 5CT)',      tf: 0.82 },
    'C95':      { yield_ksi: 95,  label: 'C95  (API 5CT)',       tf: 0.80 },
    'P110':     { yield_ksi: 110, label: 'P110 (API 5CT)',       tf: 0.85 },
    'Q125-1':   { yield_ksi: 125, label: 'Q125-1 (API 5CT)',     tf: 0.85 },
    'Q125-2':   { yield_ksi: 125, label: 'Q125-2 (API 5CT)',     tf: 0.85 },
    'Q125-3':   { yield_ksi: 125, label: 'Q125-3 (API 5CT)',     tf: 0.85 },
    'Q125-4':   { yield_ksi: 125, label: 'Q125-4 (API 5CT)',     tf: 0.85 },
    // ── Нержавеющие / коррозионностойкие ──
    '13Cr-80':  { yield_ksi: 80,  label: '13Cr-80 (13% Cr)',     tf: 0.80 },
    '13Cr-95':  { yield_ksi: 95,  label: 'S-13Cr-95 (Super 13Cr)',tf: 0.82 },
    '13Cr-110': { yield_ksi: 110, label: 'S-13Cr-110 (Super 13Cr)',tf:0.82 },
    '22Cr':     { yield_ksi: 90,  label: '22Cr Duplex',          tf: 0.80 },
    '25Cr':     { yield_ksi: 100, label: '25Cr Super Duplex',    tf: 0.80 },
    // ── API 5DP — Бурильные трубы ──
    'E-75':     { yield_ksi: 75,  label: 'E-75  (API 5DP)',      tf: 0.75 },
    'X-95':     { yield_ksi: 95,  label: 'X-95  (API 5DP)',      tf: 0.78 },
    'G-105':    { yield_ksi: 105, label: 'G-105 (API 5DP)',      tf: 0.80 },
    'S-135':    { yield_ksi: 135, label: 'S-135 (API 5DP)',      tf: 0.80 },
    'Z-140':    { yield_ksi: 140, label: 'Z-140 (API 5DP)',      tf: 0.82 },
    'V-150':    { yield_ksi: 150, label: 'V-150 (API 5DP)',      tf: 0.82 },
    // ── ТУ / нестандартные ──
    'ВМ':       { yield_ksi: 80,  label: 'ВМ (Россия)',          tf: 0.75 },
    'ДП':       { yield_ksi: 95,  label: 'ДП (Россия)',          tf: 0.78 },
};

const _GRADE_OPTIONS_HTML = '<option value="">— марка —</option>' +
    Object.entries(STEEL_GRADES).map(([k, g]) =>
        `<option value="${k}">${g.label}</option>`).join('');

// Connection thread factors (override per-grade default)
const CONN_FACTORS = { BTC: 0.85, LTC: 0.75, STC: 0.60, EUE: 0.80, NUE: 0.65, 'Drill-TJ': 0.75 };

/**
 * Auto-calculate pipe body tensile yield and thread capacity.
 * OD and linwt must be in DISPLAY units (converted from SI if needed).
 * Returns max load in kN (SI) or null if inputs insufficient.
 */
function calcPipeTensile(odDisp, linwtDisp, gradeKey, connKey) {
    const g = STEEL_GRADES[gradeKey];
    if (!g || !odDisp || !linwtDisp) return null;

    // Always work in field units for the standard formula
    const od_in  = unitSystem === 'field' ? odDisp : odDisp / 25.4;    // mm → in
    const wt_lbft = unitSystem === 'field' ? linwtDisp : linwtDisp / 1.48816; // kg/m → lb/ft

    // Wall thickness from nominal weight (API formula): w = 10.68*(D-t)*t
    const disc = od_in * od_in - wt_lbft / 2.67;
    if (disc <= 0) return null;
    const t_in = (od_in - Math.sqrt(disc)) / 2;
    if (t_in <= 0 || t_in >= od_in / 2) return null;

    // Pipe body cross-section (in²)
    const A_in2 = Math.PI * t_in * (od_in - t_in);

    // Pipe body tensile yield (kN)
    const F_body_kN = A_in2 * g.yield_ksi * 4.448;  // 1 kip = 4.448 kN

    // Thread / connection capacity
    const tf = CONN_FACTORS[connKey] ?? g.tf;
    return F_body_kN * tf;  // kN
}

/**
 * Trigger auto-calc of max load for a single assembly <tr>.
 * Reads OD, linwt, grade, conn from that row; writes to maxLoad input.
 */
function autoCalcMaxLoad(tr) {
    const numInputs = tr.querySelectorAll('input[type="number"]');
    const gradeEl   = tr.querySelector('select.grade-sel');
    const connEl    = tr.querySelector('select.conn-sel');
    const maxInp    = numInputs[4];
    if (!maxInp || !gradeEl || !connEl) return;

    const odDisp    = parseFloat(numInputs[2].value);
    const linwtDisp = parseFloat(numInputs[3].value);
    const grade     = gradeEl.value;
    const conn      = connEl.value;

    if (!grade || !conn || isNaN(odDisp) || isNaN(linwtDisp) || odDisp === 0 || linwtDisp === 0) return;

    const maxKN = calcPipeTensile(odDisp, linwtDisp, grade, conn);
    if (maxKN === null) return;

    // Display in current unit system
    const disp = fromSI(maxKN, 'force');
    maxInp.value = disp.toFixed(1);
    maxInp.dataset.auto = 'true';
    updateAssemblySummary();
}

function makeAssemblyRow(name, len, weight, od, maxLoad, wtPerUnit, grade, conn) {
    const tbody = document.getElementById('assembly-tbody');
    const idx = tbody.rows.length + 1;
    const gradeVal = grade ?? '';
    const connVal  = conn  ?? 'BTC';
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="row-num">${idx}</td>
        <td><input type="text" value="${name ?? ''}" placeholder="Элемент"></td>
        <td><input type="number" step="any" value="${len ?? ''}" placeholder="0"></td>
        <td><input type="number" step="any" value="${weight ?? ''}" placeholder="0"></td>
        <td><input type="number" step="any" value="${od ?? ''}" placeholder="0"></td>
        <td><input type="number" step="any" value="${wtPerUnit ?? ''}" placeholder="0"></td>
        <td style="min-width:120px">
            <select class="form-input grade-sel" style="padding:3px 4px;font-size:11px;width:100%">
                ${_GRADE_OPTIONS_HTML}
            </select>
        </td>
        <td style="min-width:80px">
            <select class="form-input conn-sel" style="padding:3px 4px;font-size:11px;width:100%">
                <option value="BTC">BTC</option>
                <option value="LTC">LTC</option>
                <option value="STC">STC</option>
                <option value="EUE">EUE</option>
                <option value="NUE">NUE</option>
                <option value="Drill-TJ">Drill TJ</option>
            </select>
        </td>
        <td><input type="number" step="any" value="${maxLoad ?? ''}" placeholder="авто" title="Заполняется автоматически по марке и OD"></td>
        <td><button class="btn-row-delete" onclick="deleteAssemblyRow(this)">&times;</button></td>
    `;
    tbody.appendChild(tr);

    // Set grade/conn values
    const gradeEl = tr.querySelector('select.grade-sel');
    const connEl  = tr.querySelector('select.conn-sel');
    if (gradeVal) gradeEl.value = gradeVal;
    connEl.value = connVal;

    // Numeric inputs
    const inputs = tr.querySelectorAll('input[type="number"]');
    const lenInp    = inputs[0];
    const weightInp = inputs[1];
    const odInp     = inputs[2];
    const wtPuInp   = inputs[3];

    // Auto-weight from linwt × length
    const recalcWeight = () => {
        const l   = parseFloat(lenInp.value);
        const w   = parseFloat(weightInp.value);
        const wpu = parseFloat(wtPuInp.value);
        if (!isNaN(l) && !isNaN(wpu) && (isNaN(w) || w === 0)) {
            weightInp.value = (l * wpu).toFixed(1);
        }
        updateAssemblySummary();
    };
    lenInp.addEventListener('input', recalcWeight);
    wtPuInp.addEventListener('input', recalcWeight);

    // Auto-maxLoad from OD + linwt + grade + conn
    const recalcMax = () => autoCalcMaxLoad(tr);
    odInp.addEventListener('input',   recalcMax);
    wtPuInp.addEventListener('input', recalcMax);
    gradeEl.addEventListener('change', recalcMax);
    connEl.addEventListener('change',  recalcMax);

    // Trigger on initial value (e.g. when loading sample)
    if (gradeVal && connVal && od && wtPerUnit) recalcMax();
}

function addAssemblyRow() { makeAssemblyRow('', '', '', '', '', '', '', 'BTC'); }

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
        const textInputs = row.querySelectorAll('input[type="text"]');
        const numInputs  = row.querySelectorAll('input[type="number"]');
        const gradeEl    = row.querySelector('select.grade-sel');
        const connEl     = row.querySelector('select.conn-sel');

        const name    = textInputs[0]?.value || `Элемент ${assembly.length + 1}`;
        const lenRaw  = parseFloat(numInputs[0]?.value);
        const weightRaw = parseFloat(numInputs[1]?.value);
        const odRaw   = parseFloat(numInputs[2]?.value) || 0;
        const wtPuRaw = parseFloat(numInputs[3]?.value) || 0;
        let maxLoadRaw = parseFloat(numInputs[4]?.value);
        const grade   = gradeEl?.value || '';
        const conn    = connEl?.value  || 'BTC';

        // If maxLoad is 0/empty but grade+OD+linwt present — auto-calc in SI
        if ((isNaN(maxLoadRaw) || maxLoadRaw === 0) && grade && odRaw && wtPuRaw) {
            const maxKN = calcPipeTensile(odRaw, wtPuRaw, grade, conn);
            if (maxKN !== null) maxLoadRaw = fromSI(maxKN, 'force');  // in display units
        }

        // Convert to SI
        const len     = isNaN(lenRaw)     ? NaN : toSI(lenRaw, 'depth');
        const od      = toSI(odRaw, 'od');
        const wtPu    = toSI(wtPuRaw, 'linwt');
        const maxLoad = isNaN(maxLoadRaw) ? NaN : toSI(maxLoadRaw, 'force');

        let weight;
        if (!isNaN(weightRaw) && weightRaw > 0) {
            weight = toSI(weightRaw, 'weight');
        } else if (wtPu > 0 && !isNaN(len)) {
            weight = wtPu * len;
        } else {
            weight = isNaN(weightRaw) ? NaN : 0;
        }

        if (!isNaN(len) && !isNaN(weight) && !isNaN(maxLoad)) {
            assembly.push({ name, length: len, weight_air: weight, od,
                            max_load: maxLoad, linwt: wtPu, grade });
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
    // [name, len(m), weight(kg), od(mm), maxLoad(kN), wtPerUnit(kg/m), grade, conn]
    // maxLoad=null → will be auto-calculated from grade+OD+linwt
    const sample = [
        ['Долото PDC 215.9 мм', 0.3,  45,    215.9, null, 223.2, '',     'BTC'],
        ['Забойный двигатель',  9.5,  1800,  172,   800,  283.0, '',     'BTC'],
        ['КНБК (немагнитная)',  9.0,  450,   171,   null, 74.4,  'N80-1','BTC'],
        ['УБТ 178×71',          54,   8640,  178,   null, 238.1, 'S-135','Drill-TJ'],
        ['Бурильные трубы 127×9.19', 2900, null, 127, null, 34.2, 'G-105','Drill-TJ'],
    ];
    sample.forEach(s => makeAssemblyRow(s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7]));
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
        tortuosity: parseFloat(document.getElementById('mu-tortuosity')?.value) || 0,
        centralizers: getCentralizerData(),
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
        setTimeout(() => addDepthAnnotations('reach-chart', getFormationTops(), null), 50);

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

    const muMin  = parseFloat(document.getElementById('hook-mu-min').value)  || 0.15;
    const muMax  = parseFloat(document.getElementById('hook-mu-max').value)  || 0.30;
    const pkForce = parseFloat(document.getElementById('hook-packer-force').value) || 0;
    data.mu_min = muMin;
    data.mu_max = muMax;
    data.packer_set_force = pkForce;

    document.getElementById('hook-spinner').style.display = '';
    document.getElementById('btn-calc-hook').disabled = true;
    document.getElementById('hook-results').style.display = 'none';

    try {
        const res = await apiPost('/api/calculate/hookload', data);
        document.getElementById('hook-results').style.display = '';

        if (!res.success) { showError(res.error); return; }

        state.results.hookload = res;
        const s = res.summary;
        const depthUnit = UNITS[unitSystem].depth;
        const forceUnit = UNITS[unitSystem].force;

        // ── КPI cards ──────────────────────────────────────────
        const fmt = v => fromSI(v, 'force').toFixed(1);
        document.getElementById('hook-stats').innerHTML = `
            <div class="stat-card">
                <div class="stat-label">RIH (спуск) мин–макс</div>
                <div class="stat-value">${fmt(s.rih_surface_min)}–${fmt(s.rih_surface_max)}<span class="stat-unit">${forceUnit}</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-label">POOH (подъём) мин–макс</div>
                <div class="stat-value">${fmt(s.pooh_surface_min)}–${fmt(s.pooh_surface_max)}<span class="stat-unit">${forceUnit}</span></div>
            </div>
            ${pkForce > 0 ? `
            <div class="stat-card">
                <div class="stat-label">Срыв пакера мин–макс</div>
                <div class="stat-value">${fmt(s.packer_min)}–${fmt(s.packer_max)}<span class="stat-unit">${forceUnit}</span></div>
            </div>` : ''}
            <div class="stat-card">
                <div class="stat-label">Вес в воздухе</div>
                <div class="stat-value">${fmt(s.total_weight_air)}<span class="stat-unit">${forceUnit}</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Вес с BF (без трения)</div>
                <div class="stat-value">${fmt(s.buoyed_weight)}<span class="stat-unit">${forceUnit}</span></div>
            </div>`;

        // ── Диапазонная диаграмма ─────────────────────────────
        renderHookloadBandChart(res, muMin, muMax, pkForce);

    } catch (e) {
        showError('Ошибка: ' + e.message);
    } finally {
        document.getElementById('hook-spinner').style.display = 'none';
        document.getElementById('btn-calc-hook').disabled = false;
    }
}

function renderHookloadBandChart(res, muMin, muMax, pkForce) {
    // res.results is keyed by mu value (as number, but JSON keys are strings)
    const muKeys = Object.keys(res.results).map(Number).sort((a,b) => a - b);
    const muLo = muKeys[0];
    const muHi = muKeys[muKeys.length - 1];
    const muMid = muKeys[Math.floor(muKeys.length / 2)];

    function pts(mu, dir) {
        const arr = res.results[mu][dir];
        const xs = arr.map(p => fromSI(p.force, 'force'));
        const ys = arr.map(p => fromSI(p.depth, 'depth'));
        return { xs, ys };
    }

    const depthUnit = UNITS[unitSystem].depth;
    const forceUnit = UNITS[unitSystem].force;

    // Polygon helpers for fill-between bands
    function band(loXs, hiXs, ys, fillColor, name, lineColor) {
        const xPoly = [...hiXs, ...loXs.slice().reverse()];
        const yPoly = [...ys, ...ys.slice().reverse()];
        return {
            x: xPoly, y: yPoly,
            fill: 'toself', fillcolor: fillColor,
            line: { color: 'rgba(0,0,0,0)', width: 0 },
            mode: 'lines', type: 'scatter',
            name, showlegend: true,
            hoverinfo: 'skip',
        };
    }

    function centerLine(mu, dir, color, name, dash) {
        const { xs, ys } = pts(mu, dir);
        return {
            x: xs, y: ys, type: 'scatter', mode: 'lines',
            line: { color, width: 2, dash: dash || 'solid' },
            name,
        };
    }

    const rihLo  = pts(muLo,  'rih');
    const rihHi  = pts(muHi,  'rih');
    const poohLo = pts(muLo,  'pooh');
    const poohHi = pts(muHi,  'pooh');

    const traces = [];

    // RIH band (lower hookload = easier to push in)
    traces.push(band(rihLo.xs, rihHi.xs, rihLo.ys,
        'rgba(61,90,254,0.15)', `RIH диапазон μ ${muMin}–${muMax}`, '#3d5afe'));
    // RIH center line
    traces.push(centerLine(muMid, 'rih', '#3d5afe', `RIH (μ=${res.mu_mid})`, 'dash'));

    // POOH band
    traces.push(band(poohLo.xs, poohHi.xs, poohLo.ys,
        'rgba(0,200,83,0.15)', `POOH диапазон μ ${muMin}–${muMax}`, '#00c853'));
    // POOH center line
    traces.push(centerLine(muMid, 'pooh', '#00c853', `POOH (μ=${res.mu_mid})`, 'dash'));

    // Packer release band (POOH + packer force)
    if (pkForce > 0) {
        const pkForceSI = pkForce;  // already kN
        const pkForceDisp = fromSI(pkForceSI, 'force');

        const pkLoXs = poohLo.xs.map(x => x + pkForceSI);
        const pkHiXs = poohHi.xs.map(x => x + pkForceSI);
        const pkMidXs = pts(muMid, 'pooh').xs.map(x => x + pkForceSI);

        traces.push(band(pkLoXs, pkHiXs, poohLo.ys,
            'rgba(255,109,0,0.15)', `Срыв пакера диапазон (+${pkForceSI} кН)`, '#ff6d00'));
        traces.push({
            x: pkMidXs, y: pts(muMid, 'pooh').ys,
            type: 'scatter', mode: 'lines',
            line: { color: '#ff6d00', width: 2, dash: 'dash' },
            name: `Срыв пакера (μ=${res.mu_mid})`,
        });
    }

    // Free rotation (buoyed weight only, no friction) — zero-friction reference
    const { xs: noFricXs, ys: noFricYs } = pts(muLo, 'rih');
    // Approximate no-friction as avg of rih/pooh at min mu
    const avgXs = noFricXs.map((x, i) => (x + poohLo.xs[i]) / 2);
    traces.push({
        x: avgXs, y: noFricYs,
        type: 'scatter', mode: 'lines',
        line: { color: '#90a4ae', width: 1.5, dash: 'dot' },
        name: 'Вес без трения (BF)',
    });

    const xUnit = UNITS[unitSystem].force;
    _plot('hook-chart', traces, {
        xaxis: { title: `Нагрузка на крюке (${xUnit})`, zeroline: true, zerolinewidth: 1 },
        yaxis: { autorange: 'reversed', title: `Глубина (${depthUnit})` },
        legend: { orientation: 'h', y: -0.18 },
        margin: { l: 70, r: 20, t: 36, b: 90 },
    });

    // Overlay formation tops + rig capacity
    const rigCap = parseFloat(document.getElementById('rig-hook-capacity')?.value);
    const rigCapSI = rigCap > 0 ? toSI(rigCap, 'force') : null;
    setTimeout(() => addDepthAnnotations('hook-chart', getFormationTops(), rigCapSI), 50);
}


// ════════════════════════════════════════════════════════════
// РАСЧЁТ 5 — АНАЛИЗ ЧУВСТВИТЕЛЬНОСТИ (TORNADO)
// ════════════════════════════════════════════════════════════

async function calcSensitivity() {
    const td = parseFloat(document.getElementById('sens-target-depth').value);
    if (!td || td <= 0) { showError('Укажите целевую глубину'); return; }

    const data = collectRequestData(td);
    if (data.survey.length < 2) { showError('Введите минимум 2 точки инклинометрии'); return; }
    if (!data.assembly.length)  { showError('Заполните компоновку'); return; }

    const deltaPct = parseFloat(document.getElementById('sens-delta-pct').value) || 20;
    const muBase   = parseFloat(document.getElementById('sens-mu-base').value) || 0.25;
    data.delta_pct = deltaPct;
    data.mu_base   = muBase;

    document.getElementById('sens-spinner').style.display = '';
    document.getElementById('btn-calc-sens').disabled = true;
    document.getElementById('sens-results').style.display = 'none';

    try {
        const res = await apiPost('/api/calculate/sensitivity', data);
        if (!res.success) { showError(res.error || 'Ошибка расчёта'); return; }

        document.getElementById('sens-results').style.display = '';
        const baseVal = fromSI(res.base_pooh, 'force').toFixed(1);
        document.getElementById('sens-base-val').textContent = `${baseVal} ${UNITS[unitSystem].force}`;

        // Build tornado chart: horizontal bars sorted by abs impact
        const params = res.params;  // [{name, lo, hi, lo_pct, hi_pct}]
        params.sort((a, b) => Math.abs(b.hi_pct - b.lo_pct) - Math.abs(a.hi_pct - a.lo_pct));

        const names = params.map(p => p.name);
        const loVals = params.map(p => p.lo_pct);   // negative = decrease
        const hiVals = params.map(p => p.hi_pct);   // positive = increase

        const trLo = {
            x: loVals, y: names,
            type: 'bar', orientation: 'h',
            name: `−${deltaPct}%`,
            marker: { color: 'rgba(255,23,68,0.7)' },
            text: loVals.map(v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`),
            textposition: 'outside',
        };
        const trHi = {
            x: hiVals, y: names,
            type: 'bar', orientation: 'h',
            name: `+${deltaPct}%`,
            marker: { color: 'rgba(0,200,83,0.7)' },
            text: hiVals.map(v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`),
            textposition: 'outside',
        };

        _plot('sens-chart', [trLo, trHi], {
            barmode: 'overlay',
            xaxis: { title: `Изменение POOH hookload (%)`, zeroline: true, zerolinewidth: 1.5 },
            yaxis: { automargin: true },
            height: Math.max(260, params.length * 38 + 80),
            margin: { l: 180, r: 60, t: 36, b: 50 },
            legend: { orientation: 'h', y: -0.2 },
            shapes: [{ type: 'line', x0: 0, x1: 0, y0: 0, y1: 1,
                        xref: 'x', yref: 'paper',
                        line: { color: '#6b7280', width: 1.5, dash: 'dot' } }],
        });

    } catch (e) {
        showError('Ошибка: ' + e.message);
    } finally {
        document.getElementById('sens-spinner').style.display = 'none';
        document.getElementById('btn-calc-sens').disabled = false;
    }
}


// ════════════════════════════════════════════════════════════
// РАСЧЁТ 4 — TORQUE & DRAG (перенумеровано — было 4, осталось 4)
// ════════════════════════════════════════════════════════════

let _tdOpMode = 'rih_slide';
let _tdStringModel = 'soft';

function setTdMode(mode) {
    _tdOpMode = mode;
    document.querySelectorAll('#td-op-mode .toggle-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === mode);
    });
    const wobGroup = document.getElementById('td-wob-group');
    if (wobGroup) wobGroup.style.display = mode === 'rotate_on' ? '' : 'none';
}

function setStringModel(model) {
    _tdStringModel = model;
    document.querySelectorAll('#td-string-model .toggle-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.model === model);
    });
}

async function calcTorqueDrag() {
    const td = parseFloat(document.getElementById('td-target-depth').value);
    if (!td || td <= 0) { showError('Укажите целевую глубину'); return; }

    const data = collectRequestData(td);
    if (data.survey.length < 2) { showError('Введите минимум 2 точки инклинометрии'); return; }
    if (!data.assembly.length)  { showError('Заполните компоновку'); return; }

    // Pass operating mode, WOB, and string model
    data.op_mode = _tdOpMode;
    data.use_stiff_string = (_tdStringModel === 'stiff');
    const wob = parseFloat(document.getElementById('td-wob')?.value);
    if (!isNaN(wob) && wob > 0) data.wob = toSI(wob, 'force');

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
            </div>
            <div class="stat-card">
                <div class="stat-label">Модель</div>
                <div class="stat-value" style="font-size:13px">${_tdStringModel === 'stiff' ? 'Stiff String' : 'Soft String'}</div>
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
        setTimeout(() => {
            const rigCap = parseFloat(document.getElementById('rig-hook-capacity')?.value);
            const rigCapSI = rigCap > 0 ? toSI(rigCap, 'force') : null;
            addDepthAnnotations('td-drag-chart', getFormationTops(), rigCapSI);
        }, 50);

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
        const rigMaxTorque = parseFloat(document.getElementById('rig-max-torque')?.value);
        _plot('td-torque-chart', [traceTorq], {
            xaxis: { title: 'Крутящий момент (кН·м)' },
            yaxis: { autorange: 'reversed', title: 'Глубина (м)' },
            height: 320,
            shapes: rigMaxTorque > 0 ? [{
                type: 'line', x0: rigMaxTorque, x1: rigMaxTorque,
                y0: 0, y1: 1, xref: 'x', yref: 'paper',
                line: { color: '#ff1744', width: 2, dash: 'dash' },
            }] : [],
        });
        setTimeout(() => addDepthAnnotations('td-torque-chart', getFormationTops(), null), 50);

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

        // ── Side Force (N) depth profile ──
        if (segs.length > 0) {
            // Build depth-N pairs: use midpoint of each segment
            const sfDepths = segs.map(s => (s.top + s.bottom) / 2);
            const sfN      = segs.map(s => s.N);
            const sfNames  = segs.map(s => s.name);
            _plot('td-sideforce-chart', [{
                x: sfN, y: sfDepths,
                type: 'scatter', mode: 'lines+markers',
                line: { color: '#00bcd4', width: 2.5 },
                marker: { size: 5, color: sfN.map(n =>
                    n > 30 ? '#ff1744' : n > 10 ? '#ffab00' : '#00c853') },
                text: sfNames,
                hovertemplate: '<b>%{text}</b><br>Глубина: %{y:.1f} м<br>N: %{x:.2f} кН<extra></extra>',
                fill: 'tozerox', fillcolor: 'rgba(0,188,212,0.06)',
                name: 'Side Force N',
            }], {
                xaxis: { title: 'Боковая нагрузка N (кН)', zeroline: true },
                yaxis: { autorange: 'reversed', title: 'Глубина (м)' },
                height: 300,
            });
            setTimeout(() => addDepthAnnotations('td-sideforce-chart', getFormationTops(), null), 50);
        }

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

        // ── Продольный изгиб — Profile Chart ──
        const buck = res.buckling || [];
        const buckChartDiv = document.getElementById('td-buckling-chart');
        if (buckChartDiv) {
            // Build profile from segments_rih: actual force vs critical buckling
            // Use T&D segment data to reconstruct force + critical loads per segment
            const bkDepths  = segs.map(s => s.top);
            const bkF_rih   = segs.map(s => s.F_rih_top);
            const bkF_pooh  = segs.map(s => s.F_pooh_top);

            // Map buckling critical forces to segment depths (match by top depth)
            const buckByTop = {};
            buck.forEach(b => { buckByTop[b.top] = b; });

            const crSin = segs.map(s => buckByTop[s.top]?.F_cr_sin ?? null);
            const crHel = segs.map(s => buckByTop[s.top]?.F_cr_hel ?? null);

            const trBuckRIH = {
                x: bkF_rih, y: bkDepths, type: 'scatter', mode: 'lines',
                line: { color: '#3d5afe', width: 2 }, name: 'Ос. нагрузка RIH',
            };
            const trBuckPOOH = {
                x: bkF_pooh, y: bkDepths, type: 'scatter', mode: 'lines',
                line: { color: '#00c853', width: 2 }, name: 'Ос. нагрузка POOH',
            };
            const trCrSin = {
                x: crSin.map(v => v !== null ? -v : null), y: bkDepths,
                type: 'scatter', mode: 'lines',
                line: { color: '#ffab00', width: 1.5, dash: 'dash' },
                name: 'Крит. синус. изгиб',
            };
            const trCrHel = {
                x: crHel.map(v => v !== null ? -v : null), y: bkDepths,
                type: 'scatter', mode: 'lines',
                line: { color: '#ff1744', width: 1.5, dash: 'dot' },
                name: 'Крит. спир. изгиб',
            };
            _plot('td-buckling-chart', [trBuckRIH, trBuckPOOH, trCrSin, trCrHel], {
                xaxis: { title: 'Ос. нагрузка (кН, отриц. = сжатие)', zeroline: true, zerolinewidth: 1.5 },
                yaxis: { autorange: 'reversed', title: 'Глубина (м)' },
                height: 300,
            });
        }

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

        // Show animation controls
        document.getElementById('btn-animate-rih').style.display = '';
        document.getElementById('viz-anim-controls').style.display = '';

        // Init slider
        const slider = document.getElementById('viz-depth-slider');
        if (slider) { slider.value = 100; _animSliderVal = 100; }
        const pts = res.points;
        const maxMD = pts[pts.length - 1]?.md || pts[pts.length - 1]?.depth || 0;
        const lbl = document.getElementById('viz-depth-label');
        if (lbl) lbl.textContent = `${fromSI(maxMD, 'depth').toFixed(0)} ${UNITS[unitSystem].depth}`;

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

// ════════════════════════════════════════════════════════════
// ВСТРОЕННАЯ ПОМОЩЬ (INLINE HELP PANELS)
// ════════════════════════════════════════════════════════════

function toggleHelp(id) {
    const panel = document.getElementById(id);
    if (!panel) return;
    panel.classList.toggle('visible');
}


// ════════════════════════════════════════════════════════════
// ИЕРАРХИЧЕСКАЯ СТРУКТУРА СКВАЖИНЫ
// ════════════════════════════════════════════════════════════

function updateWellTree() {
    const field = document.getElementById('well-field')?.value.trim();
    const well  = document.getElementById('well-name')?.value.trim();
    const bore  = document.getElementById('well-bore')?.value.trim();
    const kase  = document.getElementById('well-case')?.value.trim();
    const tree  = document.getElementById('well-struct-tree');
    if (!tree) return;

    const parts = [
        { label: field || null, icon: '🏭' },
        { label: well  || null, icon: '🔩' },
        { label: bore  || null, icon: '🌀' },
        { label: kase  || null, icon: '📋' },
    ].filter(p => p.label);

    if (!parts.length) {
        tree.innerHTML = '<span class="wst-empty">Введите данные структуры выше</span>';
        return;
    }

    tree.innerHTML = parts.map((p, i) =>
        `${i > 0 ? '<span class="wst-sep">›</span>' : ''}` +
        `<span class="wst-node">${p.icon} ${p.label}</span>`
    ).join('');
}

function getWellMetadata() {
    return {
        wellField: document.getElementById('well-field')?.value ?? '',
        wellName:  document.getElementById('well-name')?.value ?? '',
        wellBore:  document.getElementById('well-bore')?.value ?? '',
        wellCase:  document.getElementById('well-case')?.value ?? '',
    };
}

function applyWellMetadata(meta) {
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    set('well-field', meta.wellField);
    set('well-name',  meta.wellName);
    set('well-bore',  meta.wellBore);
    set('well-case',  meta.wellCase);
    updateWellTree();
}


// ════════════════════════════════════════════════════════════
// ЦЕМЕНТИРОВАНИЕ ХВОСТОВИКА
// ════════════════════════════════════════════════════════════

async function calcCementing() {
    const td = toSI(parseFloat(document.getElementById('cem-target-depth')?.value) || 0, 'depth');
    const lt = toSI(parseFloat(document.getElementById('cem-liner-top')?.value) || 0, 'depth');
    if (!td || td <= 0) { showError('Укажите целевую глубину (башмак хвостовика)'); return; }
    if (!lt || lt <= 0 || lt >= td) { showError('Глубина верха хвостовика должна быть < целевой'); return; }

    const data = collectRequestData(td);
    if (data.survey.length < 2) { showError('Введите минимум 2 точки инклинометрии'); return; }
    if (!data.assembly.length)  { showError('Заполните компоновку'); return; }

    data.liner_top       = lt;
    data.string_cap_lpm  = parseFloat(document.getElementById('cem-string-cap')?.value) || 6.5;
    data.annulus_cap_lpm = parseFloat(document.getElementById('cem-annulus-cap')?.value) || 8.0;
    data.cement_density  = parseFloat(document.getElementById('cem-density')?.value) || 1.85;
    data.disp_density    = parseFloat(document.getElementById('cem-disp-density')?.value) || 1.20;

    document.getElementById('cem-spinner').style.display = '';
    document.getElementById('btn-calc-cem').disabled = true;
    document.getElementById('cem-results').style.display = 'none';

    try {
        const res = await apiPost('/api/calculate/cementing', data);
        if (!res.success) { showError(res.error); return; }

        document.getElementById('cem-results').style.display = '';

        // KPI cards
        document.getElementById('cem-kpi').innerHTML = `
            <div class="stat-card">
                <div class="stat-label">До работ (базовый)</div>
                <div class="stat-value">${res.F_base}<span class="stat-unit">кН</span></div>
            </div>
            <div class="stat-card" style="border-color:var(--danger)">
                <div class="stat-label">Пик (цемент в колонне)</div>
                <div class="stat-value" style="color:var(--danger)">${res.F_peak}<span class="stat-unit">кН</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Конец работ</div>
                <div class="stat-value">${res.F_end}<span class="stat-unit">кН</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Объём хвостовика</div>
                <div class="stat-value">${res.V_total_m3}<span class="stat-unit">м³</span></div>
            </div>`;

        // Chart: hookload vs volume
        const dark = document.documentElement.getAttribute('data-theme') !== 'light';
        const bg   = dark ? '#0e0f1a' : '#ffffff';
        const grid = dark ? '#1e2035' : '#e8eaf6';

        const stageLines = res.stages.map(s => ({
            type: 'line', xref: 'x', yref: 'paper',
            x0: s.volume_m3, x1: s.volume_m3, y0: 0, y1: 1,
            line: { color: '#ffab00', width: 1, dash: 'dot' },
        }));
        const stageAnnots = res.stages.map(s => ({
            x: s.volume_m3, y: 1, xref: 'x', yref: 'paper',
            text: s.note, showarrow: false, yanchor: 'bottom',
            font: { size: 10, color: '#ffab00' },
        }));

        _plot('cem-chart', [{
            x: res.curve_volume,
            y: res.curve_hookload,
            type: 'scatter', mode: 'lines',
            line: { color: '#3d5afe', width: 2.5 },
            name: 'Нагрузка на крюке',
        }], {
            xaxis: { title: 'Объём закачки (м³)', gridcolor: grid },
            yaxis: { title: 'Нагрузка на крюке (кН)', gridcolor: grid },
            shapes: stageLines,
            annotations: stageAnnots,
            paper_bgcolor: bg, plot_bgcolor: bg,
            font: { color: dark ? '#8b8fa8' : '#4a506e' },
            margin: { t: 20, l: 60, r: 20, b: 50 },
            height: 300,
        });

        // Stage table
        document.getElementById('cem-stages').innerHTML = `
            <table class="data-table">
                <thead><tr><th>Стадия</th><th>Объём (м³)</th><th>Нагрузка на крюке (кН)</th></tr></thead>
                <tbody>
                    ${res.stages.map(s => `<tr>
                        <td>${s.name}</td>
                        <td>${s.volume_m3}</td>
                        <td><strong>${s.hookload}</strong></td>
                    </tr>`).join('')}
                </tbody>
            </table>`;

    } catch(e) {
        showError('Ошибка расчёта: ' + e.message);
    } finally {
        document.getElementById('cem-spinner').style.display = 'none';
        document.getElementById('btn-calc-cem').disabled = false;
    }
}


// ════════════════════════════════════════════════════════════
// ФЛОТАЦИЯ ОБСАДНОЙ КОЛОННЫ
// ════════════════════════════════════════════════════════════

async function calcFlotation() {
    const td = toSI(parseFloat(document.getElementById('flot-target-depth')?.value) || 0, 'depth');
    if (!td || td <= 0) { showError('Укажите целевую глубину'); return; }

    const data = collectRequestData(td);
    if (data.survey.length < 2) { showError('Введите минимум 2 точки инклинометрии'); return; }
    if (!data.assembly.length)  { showError('Заполните компоновку'); return; }

    data.fill_density = parseFloat(document.getElementById('flot-fill-density')?.value) || 0.0013;
    const rigCapDisp  = parseFloat(document.getElementById('flot-rig-cap')?.value) || 0;
    data.rig_capacity = rigCapDisp > 0 ? toSI(rigCapDisp, 'force') : 0;

    document.getElementById('flot-spinner').style.display = '';
    document.getElementById('btn-calc-flot').disabled = true;
    document.getElementById('flot-results').style.display = 'none';

    try {
        const res = await apiPost('/api/calculate/flotation', data);
        if (!res.success) { showError(res.error); return; }

        document.getElementById('flot-results').style.display = '';

        const savPct = res.reduction_pct;
        const neutral = res.neutral_depth != null
            ? `${res.neutral_depth} м` : 'Нет (не всплывает)';

        document.getElementById('flot-kpi').innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Стандартный hookload</div>
                <div class="stat-value">${res.F_standard}<span class="stat-unit">кН</span></div>
            </div>
            <div class="stat-card" style="border-color:var(--success)">
                <div class="stat-label">Флотация hookload</div>
                <div class="stat-value" style="color:var(--success)">${res.F_flotation}<span class="stat-unit">кН</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Снижение нагрузки</div>
                <div class="stat-value">${res.reduction_kN}<span class="stat-unit">кН (${savPct}%)</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Нейтральная точка</div>
                <div class="stat-value" style="font-size:13px">${neutral}</div>
            </div>`;

        // Chart
        const dark = document.documentElement.getAttribute('data-theme') !== 'light';
        const bg   = dark ? '#0e0f1a' : '#ffffff';
        const grid = dark ? '#1e2035' : '#e8eaf6';

        const traces = [
            {
                x: res.f_standard,
                y: res.depths,
                type: 'scatter', mode: 'lines',
                line: { color: '#ff6d00', width: 2, dash: 'dot' },
                name: 'Стандартный RIH',
            },
            {
                x: res.f_flotation,
                y: res.depths,
                type: 'scatter', mode: 'lines',
                line: { color: '#00c853', width: 2.5 },
                name: 'Флотация (лёгкая заливка)',
            },
        ];

        if (data.rig_capacity > 0) {
            traces.push({
                x: [fromSI(data.rig_capacity, 'force'), fromSI(data.rig_capacity, 'force')],
                y: [res.depths[0], res.depths[res.depths.length - 1]],
                type: 'scatter', mode: 'lines',
                line: { color: '#ff1744', width: 1.5, dash: 'dash' },
                name: 'Грузоподъёмность крюка',
            });
        }

        // Zero line
        traces.push({
            x: [0, 0],
            y: [res.depths[0], res.depths[res.depths.length - 1]],
            type: 'scatter', mode: 'lines',
            line: { color: '#8b8fa8', width: 1, dash: 'dot' },
            name: 'Нулевая нагрузка',
            showlegend: false,
        });

        _plot('flot-chart', traces, {
            xaxis: { title: `Нагрузка на крюке (${UNITS[unitSystem].force})`, gridcolor: grid, zeroline: true },
            yaxis: { autorange: 'reversed', title: `Глубина MD (${UNITS[unitSystem].depth})`, gridcolor: grid },
            paper_bgcolor: bg, plot_bgcolor: bg,
            font: { color: dark ? '#8b8fa8' : '#4a506e' },
            legend: { orientation: 'h', x: 0, y: 1.1 },
            margin: { t: 30, l: 60, r: 20, b: 50 },
            height: 420,
        });

    } catch(e) {
        showError('Ошибка расчёта: ' + e.message);
    } finally {
        document.getElementById('flot-spinner').style.display = 'none';
        document.getElementById('btn-calc-flot').disabled = false;
    }
}


// ════════════════════════════════════════════════════════════
// АНИМАЦИЯ СПУСКА (3D ВИЗУАЛИЗАЦИЯ)
// ════════════════════════════════════════════════════════════

let _animTimer = null;
let _animSliderVal = 100;

function onVizDepthSlider(val) {
    _animSliderVal = parseInt(val);
    if (!_vizData) return;

    const pts = _vizData.points;
    const maxMD = pts[pts.length - 1]?.md || pts[pts.length - 1]?.depth || 0;
    const currentMD = maxMD * _animSliderVal / 100;

    document.getElementById('viz-depth-label').textContent =
        `${fromSI(currentMD, 'depth').toFixed(0)} ${UNITS[unitSystem].depth}`;

    // Find slice of trajectory up to currentMD
    const slicePts = pts.filter(p => (p.md || p.depth || 0) <= currentMD + 1);
    if (!slicePts.length) return;

    // Get T&D forces if available
    const tdRes = state.results?.torqueDrag;
    const forceAtDepth = tdRes ? (depth) => {
        const fs = tdRes.forces_rih;
        if (!fs || !fs.length) return null;
        // Interpolate axial force from RIH profile (depth is MD from surface)
        const sorted = [...fs].sort((a, b) => a.depth - b.depth);
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i].depth >= depth) {
                const t = (depth - sorted[i-1].depth) / (sorted[i].depth - sorted[i-1].depth);
                return sorted[i-1].force + t * (sorted[i].force - sorted[i-1].force);
            }
        }
        return sorted[sorted.length - 1]?.force ?? null;
    } : null;

    // Color by force if available, else by inclination
    let colors;
    if (forceAtDepth) {
        colors = slicePts.map(p => forceAtDepth(p.md || p.depth || 0));
    } else {
        colors = slicePts.map(p => p.inc);
    }

    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    const bg3 = dark ? '#0a0b12' : '#f4f6fb';
    const grid3 = dark ? '#1e2035' : '#d5daf0';
    const txt3  = dark ? '#8b8fa8' : '#4a506e';

    // Full wellbore (faint)
    const trFull = {
        x: pts.map(p => p.east),
        y: pts.map(p => p.north),
        z: pts.map(p => -p.tvd),
        type: 'scatter3d', mode: 'lines',
        line: { color: dark ? '#2a2d45' : '#c5cae9', width: 3 },
        name: 'Плановая трасса',
        showlegend: false,
    };

    // String at current depth
    const trStr = {
        x: slicePts.map(p => p.east),
        y: slicePts.map(p => p.north),
        z: slicePts.map(p => -p.tvd),
        type: 'scatter3d', mode: 'lines+markers',
        line: {
            color: colors,
            colorscale: forceAtDepth ? 'RdYlGn' : 'Viridis',
            width: 6,
            reversescale: forceAtDepth ? true : false,
        },
        marker: { size: 2 },
        name: 'Инструмент',
    };

    // Bit position marker
    const last = slicePts[slicePts.length - 1];
    const trBit = {
        x: [last.east], y: [last.north], z: [-last.tvd],
        type: 'scatter3d', mode: 'markers',
        marker: { size: 8, color: '#ff1744', symbol: 'cross' },
        name: 'Долото',
    };

    _plot('viz-3d', [trFull, trStr, trBit], {
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
        legend: { x: 0.01, y: 0.99, bgcolor: 'rgba(0,0,0,0.3)', font: { color: '#fff', size: 10 } },
    }, { scrollZoom: true });
}

function animateRIH() {
    if (_animTimer) {
        clearInterval(_animTimer);
        _animTimer = null;
        document.getElementById('btn-animate-rih').textContent = '▶ Анимация спуска';
        return;
    }

    // Switch to 3D tab for animation
    switchVizTab('3d');
    const slider = document.getElementById('viz-depth-slider');
    if (!slider) return;

    slider.value = 0;
    _animSliderVal = 0;
    document.getElementById('btn-animate-rih').textContent = '⏹ Остановить';

    _animTimer = setInterval(() => {
        _animSliderVal = Math.min(100, _animSliderVal + 1);
        slider.value = _animSliderVal;
        onVizDepthSlider(_animSliderVal);
        if (_animSliderVal >= 100) {
            clearInterval(_animTimer);
            _animTimer = null;
            document.getElementById('btn-animate-rih').textContent = '▶ Анимация спуска';
        }
    }, 80);
}


// ════════════════════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function initApp() {
    // API 5CT table
    filterApi5ct();
    // Well structure tree
    updateWellTree();
    // Restore last saved session
    try { restoreLastSession(); } catch (e) { /* ignore */ }
    // Start auto-save
    startAutoSave();
});
