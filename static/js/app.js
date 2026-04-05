/* ═══════════════════════════════════════════════════════════
   WellMech — Frontend Application
   ═══════════════════════════════════════════════════════════ */

// ── Состояние приложения ──
const state = {
    survey: [],
    assembly: [],
    results: { reachability: null, hookload: null, packer: null },
};

// ── Plotly тема ──
const plotlyLayout = {
    paper_bgcolor: '#0f101a',
    plot_bgcolor: '#0a0b12',
    font: { color: '#8b8fa8', family: 'Inter, system-ui, sans-serif', size: 11 },
    margin: { l: 65, r: 20, t: 36, b: 50 },
    xaxis: {
        gridcolor: '#1e2035', linecolor: '#1e2035', zerolinecolor: '#1e2035',
        title: { font: { size: 12 } },
    },
    yaxis: {
        gridcolor: '#1e2035', linecolor: '#1e2035', zerolinecolor: '#1e2035',
        autorange: 'reversed',
        title: { font: { size: 12 } },
    },
};
const plotlyConfig = { responsive: true, displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d'] };


// ════════════════════════════════════════════════════════════
// НАВИГАЦИЯ
// ════════════════════════════════════════════════════════════

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        item.classList.add('active');
        document.getElementById('tab-' + item.dataset.tab).classList.add('active');

        if (item.dataset.tab === 'calculations') { updatePackerSelect(); syncTdDepth(); }
        if (item.dataset.tab === 'export') updateStatusChecklist();
        if (item.dataset.tab === 'assembly') updateAssemblySummary();
    });
});


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
            survey.push({ depth: d, inclination: i, azimuth: a });
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
            intervals.push({ depth_from: from, depth_to: to, mu: mu });
        }
    }
    return intervals;
}


// ════════════════════════════════════════════════════════════
// КОМПОНОВКА
// ════════════════════════════════════════════════════════════

function makeAssemblyRow(name, len, weight, od, maxLoad) {
    const tbody = document.getElementById('assembly-tbody');
    const idx = tbody.rows.length + 1;
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="row-num">${idx}</td>
        <td><input type="text" value="${name ?? ''}" placeholder="Элемент"></td>
        <td><input type="number" step="any" value="${len ?? ''}" placeholder="0"></td>
        <td><input type="number" step="any" value="${weight ?? ''}" placeholder="0"></td>
        <td><input type="number" step="any" value="${od ?? ''}" placeholder="0"></td>
        <td><input type="number" step="any" value="${maxLoad ?? ''}" placeholder="0"></td>
        <td><button class="btn-row-delete" onclick="deleteAssemblyRow(this)">&times;</button></td>
    `;
    tbody.appendChild(tr);
}

function addAssemblyRow() { makeAssemblyRow('', '', '', '', ''); }

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
        const name = inputs[0].value || `Элемент ${assembly.length + 1}`;
        const len = parseFloat(inputs[1].value);
        const weight = parseFloat(inputs[2].value);
        const od = parseFloat(inputs[3].value) || 0;
        const maxLoad = parseFloat(inputs[4].value);
        if (!isNaN(len) && !isNaN(weight) && !isNaN(maxLoad)) {
            assembly.push({ name, length: len, weight_air: weight, od, max_load: maxLoad });
        }
    }
    return assembly;
}

function updateAssemblySummary() {
    const assembly = getAssemblyData();
    const totalLen = assembly.reduce((s, e) => s + e.length, 0);
    const totalWeight = assembly.reduce((s, e) => s + e.weight_air, 0);
    const fd = parseFloat(document.getElementById('fluid-density').value) || 1.2;
    const bf = 1 - fd / 7.85;
    const buoyed = totalWeight * bf * 9.81 / 1000;

    document.getElementById('total-length').innerHTML = totalLen.toFixed(1) + '<span class="stat-unit">м</span>';
    document.getElementById('total-weight').innerHTML = totalWeight.toFixed(0) + '<span class="stat-unit">кг</span>';
    document.getElementById('buoyed-weight').innerHTML = buoyed.toFixed(1) + '<span class="stat-unit">кН</span>';
    document.getElementById('total-elements').textContent = assembly.length;
}

function loadSampleAssembly() {
    document.getElementById('assembly-tbody').innerHTML = '';
    const sample = [
        ['Долото PDC 215.9 мм', 0.3, 45, 215.9, 500],
        ['Забойный двигатель', 9.5, 1800, 172, 800],
        ['КНБК (немагнитная)', 9.0, 450, 171, 700],
        ['УБТ 178×71', 54, 8640, 178, 2400],
        ['Бурильные трубы 127×9.19', 2900, 66700, 127, 1800],
    ];
    sample.forEach(s => makeAssemblyRow(s[0], s[1], s[2], s[3], s[4]));
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
        target_depth: targetDepth,
        fluid_density: parseFloat(document.getElementById('fluid-density').value) || 1.2,
        mu_default: parseFloat(document.getElementById('mu-open').value) || 0.25,
        mu_intervals: getMuIntervals(),
    };
}

function showError(msg) {
    alert(msg);
}

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
            fill: 'tozerox',
            fillcolor: 'rgba(61,90,254,0.06)',
        };
        const layout = {
            ...plotlyLayout,
            xaxis: { ...plotlyLayout.xaxis, title: 'Осевая нагрузка (кН)' },
            yaxis: { ...plotlyLayout.yaxis, title: 'Глубина (м)' },
        };
        Plotly.newPlot('reach-chart', [trace], layout, plotlyConfig);

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
            fill: 'tozerox',
            fillcolor: 'rgba(0,188,212,0.06)',
        };
        const layout = {
            ...plotlyLayout,
            xaxis: { ...plotlyLayout.xaxis, title: 'Осевая нагрузка (кН)' },
            yaxis: { ...plotlyLayout.yaxis, title: 'Глубина (м)' },
        };
        Plotly.newPlot('hook-chart', [trace], layout, plotlyConfig);

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

        const layoutDrag = {
            ...plotlyLayout,
            xaxis: { ...plotlyLayout.xaxis, title: 'Осевая нагрузка (кН)',
                     zeroline: true, zerolinecolor: '#3a3d55', zerolinewidth: 1 },
            yaxis: { ...plotlyLayout.yaxis, title: 'Глубина (м)' },
            legend: { x: 0.01, y: 0.01, bgcolor: 'rgba(20,21,31,0.8)',
                      bordercolor: '#1e2035', font: { color: '#8b8fa8', size: 11 } },
            height: 360,
        };
        Plotly.newPlot('td-drag-chart',
                       [traceFill, traceRih, tracePooh, traceZero],
                       layoutDrag, plotlyConfig);

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
        const layoutTorq = {
            ...plotlyLayout,
            xaxis: { ...plotlyLayout.xaxis, title: 'Крутящий момент (кН·м)' },
            yaxis: { ...plotlyLayout.yaxis, title: 'Глубина (м)' },
            height: 320,
        };
        Plotly.newPlot('td-torque-chart', [traceTorq], layoutTorq, plotlyConfig);

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
        const layoutBar = {
            ...plotlyLayout,
            yaxis: { ...plotlyLayout.yaxis, autorange: 'reversed',
                     title: '', automargin: true },
            xaxis: { ...plotlyLayout.xaxis, title: 'Сила трения (кН)' },
            barmode: 'group',
            height: Math.max(220, segs.length * 32 + 60),
            margin: { ...plotlyLayout.margin, l: 160 },
            legend: { x: 0.6, y: 0.99, bgcolor: 'rgba(20,21,31,0.8)',
                      bordercolor: '#1e2035', font: { color: '#8b8fa8', size: 11 } },
        };
        Plotly.newPlot('td-friction-chart', [barRih, barPooh], layoutBar, plotlyConfig);

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
    if (done) el.classList.add('done');
    else el.classList.remove('done');
}
